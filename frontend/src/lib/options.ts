import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Account, Customer, PageResponse, Product, Supplier } from './types'

export interface VariantOption {
  id: number
  productId: number
  productName: string
  sku: string
  barcode?: string
  size?: string
  color?: string
  purchasePrice: number
  sellingPrice: number
  mrp: number
  taxRate: number
  taxInclusive: boolean
  label: string
}

export function useVariantOptions(enabled = true) {
  const query = useQuery({
    queryKey: ['catalog-options'],
    queryFn: () => api<PageResponse<Product>>('/api/catalog/products?active=true&size=200'),
    enabled,
    staleTime: 60_000
  })

  const variants: VariantOption[] = (query.data?.content ?? []).flatMap((product) =>
    product.variants
      .filter((variant) => variant.active && product.active)
      .map((variant) => ({
        id: variant.id,
        productId: product.id,
        productName: product.name,
        sku: variant.sku,
        barcode: variant.barcode,
        size: variant.size,
        color: variant.color,
        purchasePrice: variant.purchasePrice,
        sellingPrice: variant.sellingPrice,
        mrp: variant.mrp,
        taxRate: product.taxRate,
        taxInclusive: product.taxInclusive,
        label: `${product.name} · ${variant.sku}${variant.size ? ` · ${variant.size}` : ''}${
          variant.color ? ` / ${variant.color}` : ''
        }`
      }))
  )

  return { variants, isLoading: query.isLoading }
}

export function useSupplierOptions() {
  const query = useQuery({
    queryKey: ['supplier-options'],
    queryFn: () => api<Supplier[]>('/api/suppliers/lookup'),
    staleTime: 60_000
  })
  return { suppliers: query.data ?? [], isLoading: query.isLoading }
}

export function useCustomerOptions() {
  const query = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => api<Customer[]>('/api/customers/lookup'),
    staleTime: 60_000
  })
  return { customers: query.data ?? [], isLoading: query.isLoading }
}

export function useAccounts(enabled = true) {
  const query = useQuery({
    queryKey: ['accounts', 'active'],
    queryFn: () => api<Account[]>('/api/accounting/accounts'),
    enabled,
    staleTime: 60_000
  })
  return { accounts: query.data ?? [], isLoading: query.isLoading }
}
