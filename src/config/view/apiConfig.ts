// Nơi quản lý tập trung đường dẫn Server Backend (Tự động theo Host)
const getHost = () => (typeof window !== 'undefined' && window.location && window.location.hostname ? window.location.hostname : 'localhost');
export const BASE_URL = `http://${getHost()}:8082`;

export const API_ENDPOINTS = {
  PRODUCT_GROUPS: {
    DETAIL_FULL: (id: string | number) => `${BASE_URL}/api/v1/product-groups/${id}/details`, // API mới
    DETAIL: (id: string | number) => `${BASE_URL}/api/v1/product-groups/${id}`,
    UPDATE: (id: string | number) => `${BASE_URL}/api/v1/product-groups/update/${id}`,
    DELETE: (id: string | number) => `${BASE_URL}/api/v1/product-groups/delete/${id}`,
    LIST: `${BASE_URL}/api/v1/product-groups`,
  },

  PRODUCT_CATEGORY: {
    DETAIL_FULL: (id: string | number) => `${BASE_URL}/api/v1/product-category/${id}/details`, // API mới
    DETAIL: (id: string | number) => `${BASE_URL}/api/v1/product-category/${id}`,
    UPDATE: (id: string | number) => `${BASE_URL}/api/v1/product-category/update/${id}`,
    DELETE: (id: string | number) => `${BASE_URL}/api/v1/product-category/delete/${id}`,
    LIST: `${BASE_URL}/api/v1/product-category`,
  },

  PRODUCT_CRITERIA: {
    DETAIL: (id: string | number) => `${BASE_URL}/api/v1/criteria/${id}`,
    UPDATE: (id: string | number) => `${BASE_URL}/api/v1/criteria/update/${id}`,
    DELETE: (id: string | number) => `${BASE_URL}/api/v1/criteria/delete/${id}`,
    LIST: `${BASE_URL}/api/v1/criteria`,
  },

  PRODUCT_BUSINESS: { // Lưu ý: mình map nghiệp vụ vào đây
    DETAIL: (id: string | number) => `${BASE_URL}/api/v1/business/${id}`,
    UPDATE: (id: string | number) => `${BASE_URL}/api/v1/business/update/${id}`,
    DELETE: (id: string | number) => `${BASE_URL}/api/v1/business/delete/${id}`,
    LIST: `${BASE_URL}/api/v1/business`,
    PRODUCTS: (id: string | number) => `${BASE_URL}/api/v1/business/${id}/details`, // API mới
  },

  PRODUCT: {
    DETAIL: (id: string | number) => `${BASE_URL}/api/v1/products/detail/${id}`,
    UPDATE: (id: string | number) => `${BASE_URL}/api/v1/products/update/${id}`,
    DELETE: (id: string | number) => `${BASE_URL}/api/v1/products/delete/${id}`,
    LIST: `${BASE_URL}/api/v1/products`,
    LIST2: `${BASE_URL}/api/v1/product-requests`,
    EXPORT: `${BASE_URL}/api/v1/products/export`,
    IMPORT: `${BASE_URL}/api/v1/products/import`,
  },
  FILES: {
    UPLOAD: `${BASE_URL}/api/v1/files/upload`,
  },
  PRODUCT_REQUESTS: {
    UPDATE_STATUS: (requestId: string) => `${BASE_URL}/api/v1/product-requests/${requestId}/status`,
  },
  SEARCH: `${BASE_URL}/api/v1/search`,

  PRODUCTS_BY_NODE: '/api/v1/search/products-by-node',
};