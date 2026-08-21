import { unauthenticated } from "../shopify.server";

/** Minimal product/variant shapes used by the sync engine + conflict scanner. */
export interface VariantLite {
  id: string;
  title: string;
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
