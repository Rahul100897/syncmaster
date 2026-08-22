import { unauthenticated } from "../shopify.server";

/** Minimal product/variant shapes used by the sync engine + conflict scanner. */
export interface VariantLite {
  id: string;
  title: string;
  selectedOptions: Array<{ name: string; value: string }>;
  sku: string | null;
  barcode: string | null;
  price: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
}

export interface ProductLite {
  id: string;
  handle: string;
  title: string;
  status: string;
  options: string[];
  variants: VariantLite[];
}

interface ProductsQueryResponse {
  data?: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        handle: string;
        title: string;
        status: string;
        options: Array<{ name: string }>;
        variants: {
          nodes: Array<{
            id: string;
            title: string;
            selectedOptions: Array<{ name: string; value: string }>;
            sku: string | null;
            barcode: string | null;
            price: string | null;
            inventoryQuantity: number | null;
            inventoryItem: { id: string } | null;
          }>;
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

const PRODUCTS_QUERY = `#graphql
  query SyncMasterProducts($cursor: String) {
    products(first: 100, after: $cursor, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        status
        options { name }
        variants(first: 100) {
          nodes {
            id
            title
            selectedOptions { name value }
            sku
            barcode
            price
            inventoryQuantity
            inventoryItem { id }
          }
        }
      }
    }
  }
`;

/** Sleep helper for backoff (Date.now-free interval). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a GraphQL operation against `shop`'s Admin API with exponential backoff
 * on throttling / transient errors (see CLAUDE.md: backoff on all calls).
 */
export async function adminGraphql(
  shop: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const { admin } = await unauthenticated.admin(shop);
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await admin.graphql(query, { variables });
      return await res.json();
    } catch (error) {
      lastError = error;
      // Exponential backoff: 0.5s, 1s, 2s, 4s.
      await delay(500 * 2 ** attempt);
    }
  }
  throw new Error(
    `GraphQL request to ${shop} failed after retries: ${String(lastError)}`,
  );
}

export interface FetchProductsResult {
  products: ProductLite[];
  truncated: boolean;
}

/**
 * Fetch products for a shop, paginating up to `cap` products.
 * NOTE: for very large catalogs, bulkOperationRunQuery is the right tool
 * (CLAUDE.md); this bounded fetch powers the interactive scanner/dry-run and
 * reports `truncated: true` if the cap is hit (no silent truncation).
 */
export async function fetchProducts(
  shop: string,
  cap = 2000,
): Promise<FetchProductsResult> {
  const products: ProductLite[] = [];
  let cursor: string | null = null;
  let truncated = false;

  for (;;) {
    const json = (await adminGraphql(shop, PRODUCTS_QUERY, {
      cursor,
    })) as ProductsQueryResponse;

    if (json.errors?.length) {
      throw new Error(
        `Failed to fetch products from ${shop}: ${json.errors
          .map((e) => e.message)
          .join("; ")}`,
      );
    }
    const page = json.data?.products;
    if (!page) break;

    for (const node of page.nodes) {
      products.push({
        id: node.id,
        handle: node.handle,
        title: node.title,
        status: node.status,
        options: node.options.map((o) => o.name),
        variants: node.variants.nodes.map((v) => ({
          id: v.id,
          title: v.title,
          selectedOptions: v.selectedOptions,
          sku: v.sku,
          barcode: v.barcode,
          price: v.price,
          inventoryItemId: v.inventoryItem?.id ?? null,
          inventoryQuantity: v.inventoryQuantity,
        })),
      });
      if (products.length >= cap) {
        truncated = page.pageInfo.hasNextPage;
        return { products, truncated };
      }
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return { products, truncated };
}

const PRODUCT_BY_HANDLE = `#graphql
  query SyncMasterProductByHandle($q: String!) {
    products(first: 1, query: $q) {
      nodes {
        id
        handle
        title
        status
        options { name }
        variants(first: 100) {
          nodes {
            id
            title
            selectedOptions { name value }
            sku
            barcode
            price
            inventoryQuantity
            inventoryItem { id }
          }
        }
      }
    }
  }
`;

interface SingleProductResponse {
  data?: {
    products: {
      nodes: Array<{
        id: string;
        handle: string;
        title: string;
        status: string;
        options: Array<{ name: string }>;
        variants: {
          nodes: Array<{
            id: string;
            title: string;
            selectedOptions: Array<{ name: string; value: string }>;
            sku: string | null;
            barcode: string | null;
            price: string | null;
            inventoryQuantity: number | null;
            inventoryItem: { id: string } | null;
          }>;
        };
      }>;
    };
  };
}

/** Fetch a single product (with variants) by exact handle, or null. */
export async function fetchProductByHandle(
  shop: string,
  handle: string,
): Promise<ProductLite | null> {
  const json = (await adminGraphql(shop, PRODUCT_BY_HANDLE, {
    q: `handle:${JSON.stringify(handle)}`,
  })) as SingleProductResponse;
  const node = json.data?.products.nodes[0];
  if (!node || node.handle !== handle) return null;
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    status: node.status,
    options: node.options.map((o) => o.name),
    variants: node.variants.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      selectedOptions: v.selectedOptions,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      inventoryItemId: v.inventoryItem?.id ?? null,
      inventoryQuantity: v.inventoryQuantity,
    })),
  };
}

export interface OrderLite {
  id: string;
  createdAt: string;
  total: number;
  lineItems: Array<{ title: string; quantity: number; revenue: number }>;
}

const ORDERS_QUERY = `#graphql
  query SyncMasterOrders($q: String!, $cursor: String) {
    orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        createdAt
        currentTotalPriceSet { shopMoney { amount } }
        lineItems(first: 50) {
          nodes {
            title
            quantity
            originalTotalSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

interface OrdersResponse {
  data?: {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        createdAt: string;
        currentTotalPriceSet: { shopMoney: { amount: string } };
        lineItems: {
          nodes: Array<{
            title: string;
            quantity: number;
            originalTotalSet: { shopMoney: { amount: string } };
          }>;
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Fetch orders created on/after `sinceISO`, up to `cap`. Reports `truncated`
 * when the cap is hit (no silent truncation). Requires read_orders.
 */
export async function fetchOrders(
  shop: string,
  sinceISO: string,
  cap = 500,
): Promise<{ orders: OrderLite[]; truncated: boolean }> {
  const orders: OrderLite[] = [];
  let cursor: string | null = null;
  const q = `created_at:>=${sinceISO}`;

  for (;;) {
    const json = (await adminGraphql(shop, ORDERS_QUERY, { q, cursor })) as OrdersResponse;
    if (json.errors?.length) {
      throw new Error(`Failed to fetch orders from ${shop}: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    const page = json.data?.orders;
    if (!page) break;
    for (const o of page.nodes) {
      orders.push({
        id: o.id,
        createdAt: o.createdAt,
        total: Number(o.currentTotalPriceSet.shopMoney.amount) || 0,
        lineItems: o.lineItems.nodes.map((li) => ({
          title: li.title,
          quantity: li.quantity,
          revenue: Number(li.originalTotalSet.shopMoney.amount) || 0,
        })),
      });
      if (orders.length >= cap) return { orders, truncated: page.pageInfo.hasNextPage };
    }
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return { orders, truncated: false };
}

const PRODUCTS_COUNT = `#graphql
  query SyncMasterProductsCount { productsCount { count } }
`;

interface ProductsCountResp {
  data?: { productsCount: { count: number } };
}

/** Total product count on a shop (for plan-limit checks). */
export async function productCount(shop: string): Promise<number> {
  const json = (await adminGraphql(shop, PRODUCTS_COUNT)) as ProductsCountResp;
  return json.data?.productsCount.count ?? 0;
}
