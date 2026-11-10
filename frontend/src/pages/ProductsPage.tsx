import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Barcode,
  Check,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Shirt,
  Tag,
  Tags,
  Trash2
} from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { money, pct, statusTone, titleCase } from '../lib/format'
import type {
  BarcodeResponse,
  Brand,
  Category,
  PageResponse,
  Product,
  TaxCategory,
  Variant
} from '../lib/types'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  Textarea
} from '../components/ui'
import { useToast } from '../components/toast'
import { useSupplierOptions } from '../lib/options'

type Tab = 'products' | 'categories' | 'brands' | 'taxes'

interface VariantForm {
  id?: number
  sku: string
  barcode: string
  size: string
  color: string
  purchasePrice: string
  sellingPrice: string
  mrp: string
  reorderLevel: string
  active: boolean
}

interface ProductForm {
  code: string
  name: string
  categoryId: number
  brandId: number
  supplierId: number
  description: string
  hsnCode: string
  taxCategoryId: number
  purchasePrice: string
  sellingPrice: string
  mrp: string
  defaultDiscountPercent: string
  reorderLevel: string
  imageUrl: string
  active: boolean
  variants: VariantForm[]
}

const emptyVariant = (): VariantForm => ({
  sku: '',
  barcode: '',
  size: '',
  color: '',
  purchasePrice: '',
  sellingPrice: '',
  mrp: '',
  reorderLevel: '3',
  active: true
})

const emptyProduct = (): ProductForm => ({
  code: '',
  name: '',
  categoryId: 0,
  brandId: 0,
  supplierId: 0,
  description: '',
  hsnCode: '',
  taxCategoryId: 0,
  purchasePrice: '',
  sellingPrice: '',
  mrp: '',
  defaultDiscountPercent: '0',
  reorderLevel: '3',
  imageUrl: '',
  active: true,
  variants: [emptyVariant()]
})

export function ProductsPage() {
  const { has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('products')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(0)
  const [page, setPage] = useState(0)
  const [productOpen, setProductOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct())
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null)
  const [assign, setAssign] = useState<{ variantId: number; value: string } | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryEdit, setCategoryEdit] = useState<Category | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', active: true })
  const [brandOpen, setBrandOpen] = useState(false)
  const [brandEdit, setBrandEdit] = useState<Brand | null>(null)
  const [brandForm, setBrandForm] = useState({ name: '', description: '', active: true })
  const [taxOpen, setTaxOpen] = useState(false)
  const [taxEdit, setTaxEdit] = useState<TaxCategory | null>(null)
  const [taxForm, setTaxForm] = useState({
    name: '',
    hsnCode: '',
    gstRate: '',
    cgstRate: '',
    sgstRate: '',
    igstRate: '',
    exempt: false,
    taxInclusive: false,
    active: true
  })

  const { suppliers } = useSupplierOptions()

  const productsQuery = useQuery({
    queryKey: ['products', search, categoryFilter, page],
    queryFn: () =>
      api<PageResponse<Product>>(
        `/api/catalog/products${qs({ q: search, categoryId: categoryFilter || undefined, page, size: 20 })}`
      ),
    enabled: tab === 'products'
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/api/catalog/categories'),
    enabled: tab === 'products' || tab === 'categories' || productOpen
  })

  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: () => api<Brand[]>('/api/catalog/brands'),
    enabled: tab === 'brands' || productOpen
  })

  const taxesQuery = useQuery({
    queryKey: ['tax-categories'],
    queryFn: () => api<TaxCategory[]>('/api/catalog/tax-categories'),
    enabled: tab === 'taxes' || productOpen
  })

  const categories = categoriesQuery.data ?? []
  const brands = brandsQuery.data ?? []
  const taxes = taxesQuery.data ?? []

  const openCreate = () => {
    setEditingId(null)
    setProductForm(emptyProduct())
    setProductOpen(true)
  }

  const openEdit = (product: Product) => {
    setEditingId(product.id)
    setProductForm({
      code: product.code,
      name: product.name,
      categoryId: product.categoryId ?? 0,
      brandId: product.brandId ?? 0,
      supplierId: product.supplierId ?? 0,
      description: product.description ?? '',
      hsnCode: product.hsnCode ?? '',
      taxCategoryId: product.taxCategoryId ?? 0,
      purchasePrice: String(product.purchasePrice ?? ''),
      sellingPrice: String(product.sellingPrice ?? ''),
      mrp: String(product.mrp ?? ''),
      defaultDiscountPercent: String(product.defaultDiscountPercent ?? 0),
      reorderLevel: String(product.reorderLevel ?? 0),
      imageUrl: product.imageUrl ?? '',
      active: product.active,
      variants:
        product.variants.length > 0
          ? product.variants.map((variant) => ({
              id: variant.id,
              sku: variant.sku,
              barcode: variant.barcode ?? '',
              size: variant.size ?? '',
              color: variant.color ?? '',
              purchasePrice: String(variant.purchasePrice ?? ''),
              sellingPrice: String(variant.sellingPrice ?? ''),
              mrp: String(variant.mrp ?? ''),
              reorderLevel: String(variant.reorderLevel ?? 0),
              active: variant.active
            }))
          : [emptyVariant()]
    })
    setProductOpen(true)
  }

  const productMutation = useMutation({
    mutationFn: () => {
      const body = {
        code: productForm.code.trim().toUpperCase(),
        name: productForm.name.trim(),
        categoryId: productForm.categoryId || null,
        brandId: productForm.brandId || null,
        supplierId: productForm.supplierId || null,
        description: productForm.description.trim() || null,
        hsnCode: productForm.hsnCode.trim() || null,
        taxCategoryId: productForm.taxCategoryId || null,
        purchasePrice: Number(productForm.purchasePrice || 0),
        sellingPrice: Number(productForm.sellingPrice || 0),
        mrp: Number(productForm.mrp || 0),
        defaultDiscountPercent: Number(productForm.defaultDiscountPercent || 0),
        reorderLevel: Number(productForm.reorderLevel || 0),
        imageUrl: productForm.imageUrl.trim() || null,
        active: productForm.active,
        variants: productForm.variants.map((variant) => ({
          id: variant.id ?? null,
          sku: variant.sku.trim().toUpperCase(),
          barcode: variant.barcode.trim() || null,
          size: variant.size.trim() || null,
          color: variant.color.trim() || null,
          purchasePrice: Number(variant.purchasePrice || 0),
          sellingPrice: Number(variant.sellingPrice || 0),
          mrp: Number(variant.mrp || 0),
          reorderLevel: Number(variant.reorderLevel || 0),
          active: variant.active
        }))
      }
      return api<Product>(editingId ? `/api/catalog/products/${editingId}` : '/api/catalog/products', {
        method: editingId ? 'PUT' : 'POST',
        body
      })
    },
    onSuccess: (saved) => {
      toast.push(editingId ? 'Product updated' : 'Product created', {
        description: `${saved.name} · ${saved.variants.length} variants`,
        tone: 'success'
      })
      setProductOpen(false)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] })
    },
    onError: (error: Error) => toast.push('Could not save product', { description: error.message, tone: 'error' })
  })

  const categoryMutation = useMutation({
    mutationFn: () =>
      api<Category>(categoryEdit ? `/api/catalog/categories/${categoryEdit.id}` : '/api/catalog/categories', {
        method: categoryEdit ? 'PUT' : 'POST',
        body: {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
          active: categoryForm.active
        }
      }),
    onSuccess: () => {
      toast.push(categoryEdit ? 'Category updated' : 'Category created', { tone: 'success' })
      setCategoryOpen(false)
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (error: Error) => toast.push('Could not save category', { description: error.message, tone: 'error' })
  })

  const brandMutation = useMutation({
    mutationFn: () =>
      api<Brand>(brandEdit ? `/api/catalog/brands/${brandEdit.id}` : '/api/catalog/brands', {
        method: brandEdit ? 'PUT' : 'POST',
        body: {
          name: brandForm.name.trim(),
          description: brandForm.description.trim() || null,
          active: brandForm.active
        }
      }),
    onSuccess: () => {
      toast.push(brandEdit ? 'Brand updated' : 'Brand created', { tone: 'success' })
      setBrandOpen(false)
      queryClient.invalidateQueries({ queryKey: ['brands'] })
    },
    onError: (error: Error) => toast.push('Could not save brand', { description: error.message, tone: 'error' })
  })

  const taxMutation = useMutation({
    mutationFn: () =>
      api<TaxCategory>(taxEdit ? `/api/catalog/tax-categories/${taxEdit.id}` : '/api/catalog/tax-categories', {
        method: taxEdit ? 'PUT' : 'POST',
        body: {
          name: taxForm.name.trim(),
          hsnCode: taxForm.hsnCode.trim() || null,
          gstRate: Number(taxForm.gstRate || 0),
          cgstRate: Number(taxForm.cgstRate || 0),
          sgstRate: Number(taxForm.sgstRate || 0),
          igstRate: Number(taxForm.igstRate || 0),
          exempt: taxForm.exempt,
          taxInclusive: taxForm.taxInclusive,
          active: taxForm.active
        }
      }),
    onSuccess: () => {
      toast.push(taxEdit ? 'Tax category updated' : 'Tax category created', { tone: 'success' })
      setTaxOpen(false)
      queryClient.invalidateQueries({ queryKey: ['tax-categories'] })
    },
    onError: (error: Error) => toast.push('Could not save tax category', { description: error.message, tone: 'error' })
  })

  const generateBarcode = useMutation({
    mutationFn: (variantId: number) =>
      api<BarcodeResponse>('/api/catalog/barcodes/generate', {
        method: 'POST',
        body: { variantId, symbology: 'EAN13' }
      }),
    onSuccess: (result) => {
      toast.push('Barcode generated', { description: result.barcode, tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setBarcodeProduct((current) =>
        current
          ? {
              ...current,
              variants: current.variants.map((variant) =>
                variant.id === result.variantId
                  ? { ...variant, barcode: result.barcode, barcodeInternal: result.internal }
                  : variant
              )
            }
          : current
      )
    },
    onError: (error: Error) => toast.push('Could not generate barcode', { description: error.message, tone: 'error' })
  })

  const assignBarcode = useMutation({
    mutationFn: () =>
      api<BarcodeResponse>('/api/catalog/barcodes/assign', {
        method: 'POST',
        body: { variantId: assign?.variantId, barcode: assign?.value.trim() }
      }),
    onSuccess: (result) => {
      toast.push('Barcode assigned', { description: result.barcode, tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setBarcodeProduct((current) =>
        current
          ? {
              ...current,
              variants: current.variants.map((variant) =>
                variant.id === result.variantId ? { ...variant, barcode: result.barcode, barcodeInternal: false } : variant
              )
            }
          : current
      )
      setAssign(null)
    },
    onError: (error: Error) => toast.push('Could not assign barcode', { description: error.message, tone: 'error' })
  })

  const productRows = productsQuery.data?.content ?? []

  const categoryName = (id?: number) => categories.find((item) => item.id === id)?.name ?? '—'

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Catalogue · products"
        title="Styles, sizes and barcodes"
        description="A single source of truth for every SKU, its tax treatment and its barcode. Variants keep stock and pricing precise."
        actions={
          <>
            <Button variant="secondary" onClick={() => productsQuery.refetch()} loading={productsQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {tab === 'products' && has('product.manage') && (
              <Button onClick={openCreate}>
                <Plus size={14} /> New product
              </Button>
            )}
            {tab === 'categories' && has('product.manage') && (
              <Button
                onClick={() => {
                  setCategoryEdit(null)
                  setCategoryForm({ name: '', description: '', active: true })
                  setCategoryOpen(true)
                }}
              >
                <Plus size={14} /> New category
              </Button>
            )}
            {tab === 'brands' && has('product.manage') && (
              <Button
                onClick={() => {
                  setBrandEdit(null)
                  setBrandForm({ name: '', description: '', active: true })
                  setBrandOpen(true)
                }}
              >
                <Plus size={14} /> New brand
              </Button>
            )}
            {tab === 'taxes' && has('tax.manage') && (
              <Button
                onClick={() => {
                  setTaxEdit(null)
                  setTaxForm({
                    name: '',
                    hsnCode: '',
                    gstRate: '',
                    cgstRate: '',
                    sgstRate: '',
                    igstRate: '',
                    exempt: false,
                    taxInclusive: false,
                    active: true
                  })
                  setTaxOpen(true)
                }}
              >
                <Plus size={14} /> New tax category
              </Button>
            )}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            className="border-0"
            value={tab}
            onChange={(value) => setTab(value as Tab)}
            items={[
              { id: 'products', label: 'Products', count: productsQuery.data?.totalElements },
              { id: 'categories', label: 'Categories', count: categories.length },
              { id: 'brands', label: 'Brands', count: brands.length },
              { id: 'taxes', label: 'Tax categories', count: taxes.length }
            ]}
          />
        </div>

        {tab === 'products' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value)
                  setPage(0)
                }}
                placeholder="Search name, code, HSN…"
                className="w-full max-w-sm"
              />
              <Select
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(Number(event.target.value))
                  setPage(0)
                }}
                className="w-48"
              >
                <option value={0}>All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            {productsQuery.isLoading ? (
              <LoadingBlock label="Opening the catalogue…" />
            ) : productRows.length === 0 ? (
              <EmptyState
                icon={Shirt}
                title="No products in this view"
                description="Add a style with its size and colour variants to start billing."
                action={has('product.manage') ? <Button size="sm" onClick={openCreate}>Create product</Button> : undefined}
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Product</TH>
                      <TH>Category / brand</TH>
                      <TH>Tax</TH>
                      <TH align="right">Variants</TH>
                      <TH align="right">Cost</TH>
                      <TH align="right">Selling</TH>
                      <TH align="right">MRP</TH>
                      <TH align="right">Status</TH>
                      <TH align="right">Actions</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {productRows.map((product) => (
                      <TR key={product.id}>
                        <TD>
                          <span className="block font-semibold text-ink-800">{product.name}</span>
                          <span className="block font-mono text-[9.5px] text-ink-400">
                            {product.code}
                            {product.hsnCode ? ` · HSN ${product.hsnCode}` : ''}
                          </span>
                        </TD>
                        <TD className="text-[11px] text-ink-500">
                          <span className="block">{product.categoryName ?? '—'}</span>
                          <span className="block text-[10px] text-ink-400">{product.brandName ?? 'No brand'}</span>
                        </TD>
                        <TD>
                          <Badge tone={product.taxRate > 0 ? 'accent' : 'neutral'}>
                            {product.taxRate > 0 ? pct(product.taxRate) : 'Exempt'}
                          </Badge>
                          <span className="ml-1 text-[9.5px] text-ink-400">
                            {product.taxInclusive ? 'incl.' : 'excl.'}
                          </span>
                        </TD>
                        <TD align="right" className="num text-[11px]">
                          {product.variants.length}
                        </TD>
                        <TD align="right" className="num text-[11px] text-ink-500">
                          {money(product.purchasePrice)}
                        </TD>
                        <TD align="right" className="num text-[11px] font-semibold text-ink-800">
                          {money(product.sellingPrice)}
                        </TD>
                        <TD align="right" className="num text-[11px] text-ink-400">
                          {money(product.mrp)}
                        </TD>
                        <TD align="right">
                          <Badge tone={product.active ? 'success' : 'danger'} dot>
                            {product.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                        <TD align="right">
                          <div className="flex items-center justify-end gap-1">
                            {has('barcode.manage') && (
                              <IconButton label="Barcodes" onClick={() => setBarcodeProduct(product)}>
                                <Barcode size={14} />
                              </IconButton>
                            )}
                            {has('product.manage') && (
                              <IconButton label="Edit product" onClick={() => openEdit(product)}>
                                <Pencil size={14} />
                              </IconButton>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={page}
                  totalPages={productsQuery.data?.totalPages ?? 0}
                  totalElements={productsQuery.data?.totalElements ?? 0}
                  onChange={setPage}
                />
              </>
            )}
          </div>
        )}

        {tab === 'categories' && (
          <div className="border-t border-line-soft">
            {categoriesQuery.isLoading ? (
              <LoadingBlock />
            ) : categories.length === 0 ? (
              <EmptyState icon={Layers} title="No categories" description="Group products for faster POS browsing." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Category</TH>
                    <TH>Description</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </THead>
                <tbody>
                  {categories.map((category) => (
                    <TR key={category.id}>
                      <TD className="font-semibold text-ink-800">{category.name}</TD>
                      <TD className="text-[11px] text-ink-500">{category.description ?? '—'}</TD>
                      <TD align="right">
                        <Badge tone={category.active ? 'success' : 'danger'}>{category.active ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD align="right">
                        {has('product.manage') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCategoryEdit(category)
                              setCategoryForm({
                                name: category.name,
                                description: category.description ?? '',
                                active: category.active
                              })
                              setCategoryOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'brands' && (
          <div className="border-t border-line-soft">
            {brandsQuery.isLoading ? (
              <LoadingBlock />
            ) : brands.length === 0 ? (
              <EmptyState icon={Tags} title="No brands" description="Add the labels you stock." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Brand</TH>
                    <TH>Description</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </THead>
                <tbody>
                  {brands.map((brand) => (
                    <TR key={brand.id}>
                      <TD className="font-semibold text-ink-800">{brand.name}</TD>
                      <TD className="text-[11px] text-ink-500">{brand.description ?? '—'}</TD>
                      <TD align="right">
                        <Badge tone={brand.active ? 'success' : 'danger'}>{brand.active ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD align="right">
                        {has('product.manage') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setBrandEdit(brand)
                              setBrandForm({
                                name: brand.name,
                                description: brand.description ?? '',
                                active: brand.active
                              })
                              setBrandOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'taxes' && (
          <div className="border-t border-line-soft">
            {taxesQuery.isLoading ? (
              <LoadingBlock />
            ) : taxes.length === 0 ? (
              <EmptyState icon={Tag} title="No tax categories" description="Configure GST rates and HSN codes for your products." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Tax category</TH>
                    <TH>HSN</TH>
                    <TH align="right">GST</TH>
                    <TH align="right">CGST</TH>
                    <TH align="right">SGST</TH>
                    <TH align="right">IGST</TH>
                    <TH align="right">Inclusive</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </THead>
                <tbody>
                  {taxes.map((tax) => (
                    <TR key={tax.id}>
                      <TD className="font-semibold text-ink-800">{tax.name}</TD>
                      <TD className="font-mono text-[10px] text-ink-500">{tax.hsnCode ?? '—'}</TD>
                      <TD align="right" className="num text-[11px] font-semibold">
                        {pct(tax.gstRate)}
                      </TD>
                      <TD align="right" className="num text-[10.5px] text-ink-500">
                        {pct(tax.cgstRate)}
                      </TD>
                      <TD align="right" className="num text-[10.5px] text-ink-500">
                        {pct(tax.sgstRate)}
                      </TD>
                      <TD align="right" className="num text-[10.5px] text-ink-500">
                        {pct(tax.igstRate)}
                      </TD>
                      <TD align="right" className="text-[10.5px] text-ink-500">
                        {tax.taxInclusive ? 'Yes' : 'No'}
                      </TD>
                      <TD align="right">
                        <Badge tone={tax.active ? 'success' : 'danger'}>{tax.active ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD align="right">
                        {has('tax.manage') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setTaxEdit(tax)
                              setTaxForm({
                                name: tax.name,
                                hsnCode: tax.hsnCode ?? '',
                                gstRate: String(tax.gstRate),
                                cgstRate: String(tax.cgstRate),
                                sgstRate: String(tax.sgstRate),
                                igstRate: String(tax.igstRate),
                                exempt: tax.exempt,
                                taxInclusive: tax.taxInclusive ?? false,
                                active: tax.active
                              })
                              setTaxOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={productOpen}
        onClose={() => setProductOpen(false)}
        title={editingId ? 'Edit product' : 'New product'}
        description="Product-level pricing is used as the default when a variant does not override it."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setProductOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={productMutation.isPending}
              disabled={
                !productForm.code.trim() ||
                !productForm.name.trim() ||
                productForm.variants.length === 0 ||
                productForm.variants.some((variant) => !variant.sku.trim())
              }
              onClick={() => productMutation.mutate()}
            >
              {editingId ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Product code" required>
              <Input
                value={productForm.code}
                onChange={(event) => setProductForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="KD-002"
              />
            </Field>
            <Field label="Product name" required className="sm:col-span-2">
              <Input
                value={productForm.name}
                onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Kurta — hand-block print"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category">
              <Select
                value={productForm.categoryId}
                onChange={(event) => setProductForm((current) => ({ ...current, categoryId: Number(event.target.value) }))}
              >
                <option value={0}>Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand">
              <Select
                value={productForm.brandId}
                onChange={(event) => setProductForm((current) => ({ ...current, brandId: Number(event.target.value) }))}
              >
                <option value={0}>No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Preferred supplier">
              <Select
                value={productForm.supplierId}
                onChange={(event) => setProductForm((current) => ({ ...current, supplierId: Number(event.target.value) }))}
              >
                <option value={0}>None</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tax category">
              <Select
                value={productForm.taxCategoryId}
                onChange={(event) => setProductForm((current) => ({ ...current, taxCategoryId: Number(event.target.value) }))}
              >
                <option value={0}>No tax category</option>
                {taxes.map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.name} · {tax.gstRate}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="HSN code">
              <Input
                value={productForm.hsnCode}
                onChange={(event) => setProductForm((current) => ({ ...current, hsnCode: event.target.value }))}
                placeholder="6204"
              />
            </Field>
            <Field label="Default discount %">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={productForm.defaultDiscountPercent}
                onChange={(event) =>
                  setProductForm((current) => ({ ...current, defaultDiscountPercent: event.target.value }))
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Purchase price" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={productForm.purchasePrice}
                onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))}
              />
            </Field>
            <Field label="Selling price" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={productForm.sellingPrice}
                onChange={(event) => setProductForm((current) => ({ ...current, sellingPrice: event.target.value }))}
              />
            </Field>
            <Field label="MRP" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={productForm.mrp}
                onChange={(event) => setProductForm((current) => ({ ...current, mrp: event.target.value }))}
              />
            </Field>
            <Field label="Reorder level">
              <Input
                type="number"
                min={0}
                value={productForm.reorderLevel}
                onChange={(event) => setProductForm((current) => ({ ...current, reorderLevel: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={productForm.description}
              onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Fabric, fit and care notes…"
            />
          </Field>
          <Checkbox
            label="Product is active and available for billing"
            checked={productForm.active}
            onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Variants</p>
                <p className="text-[10px] text-ink-400">One row per size/colour combination. SKU must be unique.</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setProductForm((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))
                }
              >
                <Plus size={12} /> Add variant
              </Button>
            </div>
            <div className="space-y-2">
              {productForm.variants.map((variant, index) => (
                <div key={index} className="rounded-xl border border-line bg-ivory-100/40 p-3">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Field label="SKU" required>
                      <Input
                        value={variant.sku}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) => (i === index ? { ...row, sku: event.target.value } : row))
                          }))
                        }
                        placeholder="4-digit code e.g. 1001"
                      />
                    </Field>
                    <Field label="Size">
                      <Input
                        value={variant.size}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) => (i === index ? { ...row, size: event.target.value } : row))
                          }))
                        }
                        placeholder="34Y"
                      />
                    </Field>
                    <Field label="Colour">
                      <Input
                        value={variant.color}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) => (i === index ? { ...row, color: event.target.value } : row))
                          }))
                        }
                        placeholder="Indigo"
                      />
                    </Field>
                    <Field label="Barcode" hint="Optional">
                      <Input
                        value={variant.barcode}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) => (i === index ? { ...row, barcode: event.target.value } : row))
                          }))
                        }
                        placeholder="8901234567890"
                      />
                    </Field>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-5">
                    <Field label="Purchase">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.purchasePrice}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) =>
                              i === index ? { ...row, purchasePrice: event.target.value } : row
                            )
                          }))
                        }
                      />
                    </Field>
                    <Field label="Selling">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.sellingPrice}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) =>
                              i === index ? { ...row, sellingPrice: event.target.value } : row
                            )
                          }))
                        }
                      />
                    </Field>
                    <Field label="MRP">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.mrp}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) => (i === index ? { ...row, mrp: event.target.value } : row))
                          }))
                        }
                      />
                    </Field>
                    <Field label="Reorder">
                      <Input
                        type="number"
                        min={0}
                        value={variant.reorderLevel}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) =>
                              i === index ? { ...row, reorderLevel: event.target.value } : row
                            )
                          }))
                        }
                      />
                    </Field>
                    <div className="flex items-end justify-between gap-2">
                      <Checkbox
                        label="Active"
                        checked={variant.active}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.map((row, i) => (i === index ? { ...row, active: event.target.checked } : row))
                          }))
                        }
                      />
                      <IconButton
                        label="Remove variant"
                        disabled={productForm.variants.length === 1}
                        onClick={() =>
                          setProductForm((current) => ({
                            ...current,
                            variants: current.variants.filter((_, i) => i !== index)
                          }))
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={categoryEdit ? 'Edit category' : 'New category'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCategoryOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={categoryMutation.isPending} disabled={!categoryForm.name.trim()} onClick={() => categoryMutation.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required>
            <Input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label="Description">
            <Textarea
              value={categoryForm.description}
              onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
            />
          </Field>
          <Checkbox
            label="Active"
            checked={categoryForm.active}
            onChange={(event) => setCategoryForm((current) => ({ ...current, active: event.target.checked }))}
          />
        </div>
      </Modal>

      <Modal
        open={brandOpen}
        onClose={() => setBrandOpen(false)}
        title={brandEdit ? 'Edit brand' : 'New brand'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setBrandOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={brandMutation.isPending} disabled={!brandForm.name.trim()} onClick={() => brandMutation.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required>
            <Input value={brandForm.name} onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label="Description">
            <Textarea
              value={brandForm.description}
              onChange={(event) => setBrandForm((current) => ({ ...current, description: event.target.value }))}
            />
          </Field>
          <Checkbox
            label="Active"
            checked={brandForm.active}
            onChange={(event) => setBrandForm((current) => ({ ...current, active: event.target.checked }))}
          />
        </div>
      </Modal>

      <Modal
        open={taxOpen}
        onClose={() => setTaxOpen(false)}
        title={taxEdit ? 'Edit tax category' : 'New tax category'}
        description="GST rates are configuration, never hardcoded. Keep CGST + SGST equal to GST for intra-state sales."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTaxOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={taxMutation.isPending} disabled={!taxForm.name.trim()} onClick={() => taxMutation.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={taxForm.name} onChange={(event) => setTaxForm((current) => ({ ...current, name: event.target.value }))} placeholder="GST 5%" />
            </Field>
            <Field label="HSN code">
              <Input value={taxForm.hsnCode} onChange={(event) => setTaxForm((current) => ({ ...current, hsnCode: event.target.value }))} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="GST %" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={taxForm.gstRate}
                onChange={(event) => setTaxForm((current) => ({ ...current, gstRate: event.target.value }))}
              />
            </Field>
            <Field label="CGST %" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={taxForm.cgstRate}
                onChange={(event) => setTaxForm((current) => ({ ...current, cgstRate: event.target.value }))}
              />
            </Field>
            <Field label="SGST %" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={taxForm.sgstRate}
                onChange={(event) => setTaxForm((current) => ({ ...current, sgstRate: event.target.value }))}
              />
            </Field>
            <Field label="IGST %" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={taxForm.igstRate}
                onChange={(event) => setTaxForm((current) => ({ ...current, igstRate: event.target.value }))}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const rate = Number(taxForm.gstRate || 0)
                setTaxForm((current) => ({
                  ...current,
                  cgstRate: String(rate / 2),
                  sgstRate: String(rate / 2),
                  igstRate: '0'
                }))
              }}
            >
              Split intra-state
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const rate = Number(taxForm.gstRate || 0)
                setTaxForm((current) => ({ ...current, cgstRate: '0', sgstRate: '0', igstRate: String(rate) }))
              }}
            >
              Inter-state IGST
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="Exempt"
              checked={taxForm.exempt}
              onChange={(event) => setTaxForm((current) => ({ ...current, exempt: event.target.checked }))}
            />
            <Checkbox
              label="Prices are tax-inclusive by default"
              checked={taxForm.taxInclusive}
              onChange={(event) => setTaxForm((current) => ({ ...current, taxInclusive: event.target.checked }))}
            />
            <Checkbox
              label="Active"
              checked={taxForm.active}
              onChange={(event) => setTaxForm((current) => ({ ...current, active: event.target.checked }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={barcodeProduct != null}
        onClose={() => setBarcodeProduct(null)}
        title="Barcodes"
        description={barcodeProduct ? `${barcodeProduct.name} · ${barcodeProduct.code}` : undefined}
        size="lg"
      >
        <div className="space-y-2">
          {barcodeProduct?.variants.map((variant) => (
            <div key={variant.id} className="rounded-xl border border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-[11px] font-semibold text-ink-800">{variant.sku}</p>
                  <p className="text-[10px] text-ink-400">
                    {variant.size ?? '—'} · {variant.color ?? '—'} · {money(variant.sellingPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-line-soft bg-ivory-100 px-2 py-1 font-mono text-[10px] text-ink-600">
                    {variant.barcode ?? 'No barcode'}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={generateBarcode.isPending}
                    onClick={() => generateBarcode.mutate(variant.id)}
                  >
                    <Barcode size={12} /> Generate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAssign({ variantId: variant.id, value: variant.barcode ?? '' })}>
                    Assign
                  </Button>
                </div>
              </div>
              {variant.barcodeInternal && (
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-terracotta-500">Internal EAN-13</p>
              )}
            </div>
          ))}
          {assign && (
            <div className="rounded-xl border border-terracotta-200 bg-terracotta-50/50 p-3">
              <p className="mb-2 text-[11px] font-semibold text-ink-700">Assign an existing barcode</p>
              <div className="flex items-end gap-2">
                <Field label="Barcode" className="flex-1">
                  <Input
                    value={assign.value}
                    onChange={(event) => setAssign((current) => (current ? { ...current, value: event.target.value } : current))}
                    placeholder="Scan or type the barcode"
                    autoFocus
                  />
                </Field>
                <Button size="sm" loading={assignBarcode.isPending} disabled={!assign.value.trim()} onClick={() => assignBarcode.mutate()}>
                  <Check size={12} /> Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
