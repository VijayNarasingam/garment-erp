import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  BellRing,
  Building2,
  CheckCircle2,
  CircleUserRound,
  CloudOff,
  DatabaseBackup,
  Download,
  KeyRound,
  LockKeyhole,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Tags,
  Trash2,
  UserCog,
  Users
} from 'lucide-react'
import { api, downloadFile, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { clearOfflineUsers, forgetOfflineUser, listOfflineUsers, setOfflinePin, updateOfflinePassword, type OfflineUserSummary } from '../lib/offlineAuth'
import { fileSize, formatDate, formatDateTime, money, statusTone, titleCase, todayISO } from '../lib/format'
import type {
  Backup,
  Branch,
  BusinessSettings,
  NotificationLog,
  NotificationTemplate,
  PageResponse,
  PermissionInfo,
  Role,
  TaxCategory,
  User
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
  SectionCard,
  Select,
  StatCard,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  Textarea
} from '../components/ui'
import { useToast } from '../components/toast'

type Tab = 'profile' | 'offline' | 'business' | 'print' | 'branches' | 'users' | 'roles' | 'tax' | 'notifications' | 'backups'

const notificationEvents = [
  'INVOICE_CONFIRMATION',
  'PAYMENT_CONFIRMATION',
  'PAYMENT_REMINDER',
  'LOW_STOCK',
  'PURCHASE_ALERT',
  'DAILY_SALES_SUMMARY',
  'RETURN_REFUND'
]

const notificationChannels = ['WHATSAPP', 'SMS', 'EMAIL']

interface BusinessForm {
  name: string
  legalName: string
  gstEnabled: boolean
  gstin: string
  stateCode: string
  address: string
  phone: string
  email: string
  financialYearStartMonth: string
  invoicePrefix: string
  roundOffEnabled: boolean
  defaultTaxInclusive: boolean
  returnWindowDays: string
  exchangeWindowDays: string
  returnApprovalRequired: boolean
  refundToOriginalMethodOnly: boolean
  maxDiscountPercent: string
  allowNegativeStockWithApproval: boolean
  timezone: string
  costingMethod: string
  thankYouNote: string
}

const toBusinessForm = (business: BusinessSettings): BusinessForm => ({
  name: business.name,
  legalName: business.legalName ?? '',
  gstEnabled: business.gstEnabled,
  gstin: business.gstin ?? '',
  stateCode: business.stateCode ?? '',
  address: business.address ?? '',
  phone: business.phone ?? '',
  email: business.email ?? '',
  financialYearStartMonth: String(business.financialYearStartMonth),
  invoicePrefix: business.invoicePrefix,
  roundOffEnabled: business.roundOffEnabled,
  defaultTaxInclusive: business.defaultTaxInclusive,
  returnWindowDays: String(business.returnWindowDays),
  exchangeWindowDays: String(business.exchangeWindowDays),
  returnApprovalRequired: business.returnApprovalRequired,
  refundToOriginalMethodOnly: business.refundToOriginalMethodOnly,
  maxDiscountPercent: String(business.maxDiscountPercent),
  allowNegativeStockWithApproval: business.allowNegativeStockWithApproval,
  timezone: business.timezone ?? '',
  costingMethod: business.costingMethod,
  thankYouNote: business.thankYouNote ?? 'Thank you for shopping with us!'
})

const emptyBranchForm = () => ({
  code: '',
  name: '',
  address: '',
  city: '',
  state: '',
  stateCode: '',
  phone: '',
  email: '',
  gstin: '',
  invoicePrefix: '',
  primaryBranch: false
})

interface UserForm {
  username: string
  email: string
  password: string
  fullName: string
  phone: string
  roleIds: number[]
  branchIds: number[]
  defaultBranchId: number
  pin: string
  active: boolean
}

const emptyUserForm = (): UserForm => ({
  username: '',
  email: '',
  password: '',
  fullName: '',
  phone: '',
  roleIds: [],
  branchIds: [],
  defaultBranchId: 0,
  pin: '',
  active: true
})

const emptyRoleForm = () => ({
  code: '',
  name: '',
  description: '',
  discountLimitPercent: '0',
  permissionCodes: [] as string[]
})

const emptyTaxForm = () => ({
  name: '',
  hsnCode: '',
  gstRate: '',
  cgstRate: '',
  sgstRate: '',
  igstRate: '',
  exempt: false,
  taxInclusive: true,
  active: true
})

const emptyTemplateForm = () => ({
  event: 'INVOICE_CONFIRMATION',
  channel: 'WHATSAPP',
  subject: '',
  body: '',
  active: true
})

export function SettingsPage() {
  const { user, business: authBusiness, has, hasAny, refresh, session } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const canBusiness = hasAny('settings.view', 'settings.manage')
  const canBranches = hasAny('branch.view', 'branch.manage')
  const canUsers = hasAny('user.view', 'user.manage')
  const canRoles = hasAny('user.view', 'role.manage')
  const canTax = hasAny('tax.manage', 'product.view')
  const canNotifications = hasAny('notification.view', 'notification.manage')
  const canBackups = has('backup.manage')

  const availableTabs = useMemo(() => {
    const items: { id: Tab; label: string; count?: number }[] = [
      { id: 'profile', label: 'My profile' },
      { id: 'offline', label: 'Offline access' }
    ]
    if (canBusiness) items.push({ id: 'business', label: 'Business' })
    if (canBusiness) items.push({ id: 'print', label: 'Bill print' })
    if (canBranches) items.push({ id: 'branches', label: 'Branches' })
    if (canUsers) items.push({ id: 'users', label: 'Users' })
    if (canRoles) items.push({ id: 'roles', label: 'Roles' })
    if (canTax) items.push({ id: 'tax', label: 'Tax & GST' })
    if (canNotifications) items.push({ id: 'notifications', label: 'Notifications' })
    if (canBackups) items.push({ id: 'backups', label: 'Backups' })
    return items
  }, [canBusiness, canBranches, canUsers, canRoles, canTax, canNotifications, canBackups])

  const requestedTab = searchParams.get('tab') as Tab | null
  const [tab, setTabState] = useState<Tab>(
    requestedTab && availableTabs.some((item) => item.id === requestedTab) ? requestedTab : 'profile'
  )

  const setTab = (next: Tab) => {
    setTabState(next)
    setSearchParams(next === 'profile' ? {} : { tab: next }, { replace: true })
  }

  // ---------- Profile ----------
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pinForm, setPinForm] = useState({ pin: '', confirm: '' })

  // ---------- Offline access ----------
  const [offlineUsers, setOfflineUsers] = useState<OfflineUserSummary[]>([])
  const [offlinePinForm, setOfflinePinForm] = useState({ pin: '', confirm: '' })
  const [offlineBusy, setOfflineBusy] = useState(false)
  const [forgetAllArmed, setForgetAllArmed] = useState(false)
  const [offlineRefresh, setOfflineRefresh] = useState(0)

  const myOfflineRecord = offlineUsers.find((row) => user?.username && row.username.toLowerCase() === user.username.toLowerCase()) ?? null
  const otherOfflineUsers = offlineUsers.filter((row) => !user?.username || row.username.toLowerCase() !== user.username.toLowerCase())

  useEffect(() => {
    if (tab !== 'offline') return
    let active = true
    void listOfflineUsers().then((rows) => {
      if (active) setOfflineUsers(rows)
    })
    return () => {
      active = false
    }
  }, [tab, offlineRefresh])

  // ---------- Business ----------
  const [businessForm, setBusinessForm] = useState<BusinessForm | null>(null)

  // ---------- Branches ----------
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchEdit, setBranchEdit] = useState<Branch | null>(null)
  const [branchForm, setBranchForm] = useState(emptyBranchForm())

  // ---------- Users ----------
  const [userOpen, setUserOpen] = useState(false)
  const [userEdit, setUserEdit] = useState<User | null>(null)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm())
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pinUser, setPinUser] = useState<User | null>(null)
  const [userPin, setUserPin] = useState('')

  // ---------- Roles ----------
  const [roleOpen, setRoleOpen] = useState(false)
  const [roleEdit, setRoleEdit] = useState<Role | null>(null)
  const [roleForm, setRoleForm] = useState(emptyRoleForm())

  // ---------- Tax ----------
  const [taxOpen, setTaxOpen] = useState(false)
  const [taxEdit, setTaxEdit] = useState<TaxCategory | null>(null)
  const [taxForm, setTaxForm] = useState(emptyTaxForm())

  // ---------- Notifications ----------
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm())
  const [logPage, setLogPage] = useState(0)

  // ---------- Backups ----------
  const [restoreBackup, setRestoreBackup] = useState<Backup | null>(null)
  const [restoreForm, setRestoreForm] = useState({ confirmation: '', approverUsername: '', approverPin: '', reason: '' })

  const businessQuery = useQuery({
    queryKey: ['business-settings'],
    queryFn: () => api<BusinessSettings>('/api/business'),
    enabled: canBusiness
  })

  const branchesQuery = useQuery({
    queryKey: ['branches-settings'],
    queryFn: () => api<Branch[]>('/api/branches'),
    enabled: canBranches
  })

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/api/users'),
    enabled: canUsers && has('user.view')
  })

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<Role[]>('/api/roles'),
    enabled: canRoles
  })

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<PermissionInfo[]>('/api/auth/permissions'),
    enabled: hasAny('user.manage', 'role.manage')
  })

  const taxQuery = useQuery({
    queryKey: ['tax-categories'],
    queryFn: () => api<TaxCategory[]>('/api/catalog/tax-categories'),
    enabled: canTax
  })

  const templatesQuery = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => api<NotificationTemplate[]>('/api/notifications/templates'),
    enabled: canNotifications
  })

  const logsQuery = useQuery({
    queryKey: ['notification-logs', logPage],
    queryFn: () => api<PageResponse<NotificationLog>>(`/api/notifications/logs${qs({ page: logPage, size: 20 })}`),
    enabled: canNotifications
  })

  const backupsQuery = useQuery({
    queryKey: ['backups'],
    queryFn: () => api<Backup[]>('/api/backups'),
    enabled: canBackups
  })

  useEffect(() => {
    if (businessQuery.data) setBusinessForm(toBusinessForm(businessQuery.data))
  }, [businessQuery.data])

  const branches = branchesQuery.data ?? []
  const users = usersQuery.data ?? []
  const roles = rolesQuery.data ?? []
  const permissions = permissionsQuery.data ?? []
  const taxCategories = taxQuery.data ?? []
  const templates = templatesQuery.data ?? []
  const logs = logsQuery.data?.content ?? []
  const backups = backupsQuery.data ?? []

  const permissionGroups = useMemo(() => {
    const map = new Map<string, PermissionInfo[]>()
    for (const permission of permissions) {
      const list = map.get(permission.module) ?? []
      list.push(permission)
      map.set(permission.module, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [permissions])

  const invalidateBusiness = () => {
    queryClient.invalidateQueries({ queryKey: ['business-settings'] })
    void refresh()
  }

  // ---------- Mutations ----------
  const passwordMutation = useMutation({
    mutationFn: () =>
      api<void>('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }
      }),
    onSuccess: () => {
      toast.push('Password changed', { description: 'Use the new password the next time you sign in.', tone: 'success' })
      // Keep the offline copy of this account in sync — the old password must stop opening the counter.
      void updateOfflinePassword(session, passwordForm.newPassword).catch(() => undefined)
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' })
    },
    onError: (error: Error) => toast.push('Could not change password', { description: error.message, tone: 'error' })
  })

  const pinMutation = useMutation({
    mutationFn: () => api<void>('/api/auth/pin', { method: 'POST', body: { pin: pinForm.pin } }),
    onSuccess: () => {
      toast.push('Approval PIN set', { description: 'Use this PIN to authorise discounts, stock and cash actions.', tone: 'success' })
      setPinForm({ pin: '', confirm: '' })
    },
    onError: (error: Error) => toast.push('Could not set PIN', { description: error.message, tone: 'error' })
  })

  const businessMutation = useMutation({
    mutationFn: () => {
      const form = businessForm!
      return api<BusinessSettings>('/api/business', {
        method: 'PUT',
        body: {
          name: form.name.trim(),
          legalName: form.legalName.trim() || null,
          gstEnabled: form.gstEnabled,
          gstin: form.gstin.trim() || null,
          stateCode: form.stateCode.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          financialYearStartMonth: Number(form.financialYearStartMonth || 4),
          invoicePrefix: form.invoicePrefix.trim().toUpperCase(),
          roundOffEnabled: form.roundOffEnabled,
          defaultTaxInclusive: form.defaultTaxInclusive,
          returnWindowDays: Number(form.returnWindowDays || 0),
          exchangeWindowDays: Number(form.exchangeWindowDays || 0),
          returnApprovalRequired: form.returnApprovalRequired,
          refundToOriginalMethodOnly: form.refundToOriginalMethodOnly,
          maxDiscountPercent: Number(form.maxDiscountPercent || 0),
          allowNegativeStockWithApproval: form.allowNegativeStockWithApproval,
          timezone: form.timezone.trim() || null,
          thankYouNote: form.thankYouNote.trim() || null
        }
      })
    },
    onSuccess: (saved) => {
      setBusinessForm(toBusinessForm(saved))
      toast.push('Business settings saved', { description: `${saved.name} · invoice prefix ${saved.invoicePrefix}`, tone: 'success' })
      invalidateBusiness()
    },
    onError: (error: Error) => toast.push('Could not save business settings', { description: error.message, tone: 'error' })
  })

  const branchMutation = useMutation({
    mutationFn: () =>
      api<Branch>(branchEdit ? `/api/branches/${branchEdit.id}` : '/api/branches', {
        method: branchEdit ? 'PUT' : 'POST',
        body: {
          code: branchForm.code.trim().toUpperCase(),
          name: branchForm.name.trim(),
          address: branchForm.address.trim() || null,
          city: branchForm.city.trim() || null,
          state: branchForm.state.trim() || null,
          stateCode: branchForm.stateCode.trim() || null,
          phone: branchForm.phone.trim() || null,
          email: branchForm.email.trim() || null,
          gstin: branchForm.gstin.trim() || null,
          invoicePrefix: branchForm.invoicePrefix.trim().toUpperCase(),
          primaryBranch: branchForm.primaryBranch
        }
      }),
    onSuccess: (saved) => {
      toast.push(branchEdit ? 'Branch updated' : 'Branch created', {
        description: `${saved.name} · ${saved.code}${saved.primaryBranch ? ' · primary' : ''}`,
        tone: 'success'
      })
      setBranchOpen(false)
      queryClient.invalidateQueries({ queryKey: ['branches-settings'] })
      void refresh()
    },
    onError: (error: Error) => toast.push('Could not save branch', { description: error.message, tone: 'error' })
  })

  const branchStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api<Branch>(`/api/branches/${id}/status?active=${active}`, { method: 'PATCH' }),
    onSuccess: (saved) => {
      toast.push(saved.active ? 'Branch activated' : 'Branch deactivated', { description: saved.name, tone: 'info' })
      queryClient.invalidateQueries({ queryKey: ['branches-settings'] })
      void refresh()
    },
    onError: (error: Error) => toast.push('Could not change branch status', { description: error.message, tone: 'error' })
  })

  const userMutation = useMutation({
    mutationFn: () => {
      if (userEdit) {
        return api<User>(`/api/users/${userEdit.id}`, {
          method: 'PUT',
          body: {
            email: userForm.email.trim(),
            fullName: userForm.fullName.trim(),
            phone: userForm.phone.trim() || null,
            active: userForm.active,
            roleIds: userForm.roleIds,
            branchIds: userForm.branchIds,
            defaultBranchId: userForm.defaultBranchId || userForm.branchIds[0]
          }
        })
      }
      return api<User>('/api/users', {
        method: 'POST',
        body: {
          username: userForm.username.trim(),
          email: userForm.email.trim(),
          password: userForm.password,
          fullName: userForm.fullName.trim(),
          phone: userForm.phone.trim() || null,
          roleIds: userForm.roleIds,
          branchIds: userForm.branchIds,
          defaultBranchId: userForm.defaultBranchId || userForm.branchIds[0],
          pin: userForm.pin.trim() || null
        }
      })
    },
    onSuccess: (saved) => {
      toast.push(userEdit ? 'User updated' : 'User created', {
        description: `${saved.fullName} · ${saved.username}`,
        tone: 'success'
      })
      setUserOpen(false)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      void refresh()
    },
    onError: (error: Error) => toast.push('Could not save user', { description: error.message, tone: 'error' })
  })

  const resetPasswordMutation = useMutation({
    mutationFn: () =>
      api<void>(`/api/users/${passwordUser!.id}/reset-password`, {
        method: 'POST',
        body: { newPassword }
      }),
    onSuccess: () => {
      toast.push('Password reset', { description: `${passwordUser?.fullName} must sign in with the new password.`, tone: 'success' })
      setPasswordUser(null)
      setNewPassword('')
    },
    onError: (error: Error) => toast.push('Could not reset password', { description: error.message, tone: 'error' })
  })

  const setUserPinMutation = useMutation({
    mutationFn: () =>
      api<void>(`/api/users/${pinUser!.id}/pin`, {
        method: 'POST',
        body: { pin: userPin }
      }),
    onSuccess: () => {
      toast.push('Approval PIN updated', { description: pinUser?.fullName, tone: 'success' })
      setPinUser(null)
      setUserPin('')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => toast.push('Could not set PIN', { description: error.message, tone: 'error' })
  })

  const roleMutation = useMutation({
    mutationFn: () =>
      api<Role>(roleEdit ? `/api/roles/${roleEdit.id}` : '/api/roles', {
        method: roleEdit ? 'PUT' : 'POST',
        body: roleEdit
          ? {
              name: roleForm.name.trim(),
              description: roleForm.description.trim() || null,
              discountLimitPercent: Number(roleForm.discountLimitPercent || 0),
              permissionCodes: roleForm.permissionCodes
            }
          : {
              code: roleForm.code.trim(),
              name: roleForm.name.trim(),
              description: roleForm.description.trim() || null,
              discountLimitPercent: Number(roleForm.discountLimitPercent || 0),
              permissionCodes: roleForm.permissionCodes
            }
      }),
    onSuccess: (saved) => {
      toast.push(roleEdit ? 'Role updated' : 'Role created', {
        description: `${saved.name} · ${saved.permissions.length} permissions`,
        tone: 'success'
      })
      setRoleOpen(false)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => toast.push('Could not save role', { description: error.message, tone: 'error' })
  })

  const taxMutation = useMutation({
    mutationFn: () =>
      api<TaxCategory>(taxEdit ? `/api/catalog/tax-categories/${taxEdit.id}` : '/api/catalog/tax-categories', {
        method: taxEdit ? 'PUT' : 'POST',
        body: {
          name: taxForm.name.trim(),
          hsnCode: taxForm.hsnCode.trim() || null,
          gstRate: taxForm.exempt ? 0 : Number(taxForm.gstRate || 0),
          cgstRate: taxForm.exempt ? 0 : Number(taxForm.cgstRate || 0),
          sgstRate: taxForm.exempt ? 0 : Number(taxForm.sgstRate || 0),
          igstRate: taxForm.exempt ? 0 : Number(taxForm.igstRate || 0),
          exempt: taxForm.exempt,
          taxInclusive: taxForm.taxInclusive,
          active: taxForm.active
        }
      }),
    onSuccess: (saved) => {
      toast.push(taxEdit ? 'Tax category updated' : 'Tax category created', {
        description: `${saved.name} · ${Number(saved.gstRate).toFixed(2)}%`,
        tone: 'success'
      })
      setTaxOpen(false)
      queryClient.invalidateQueries({ queryKey: ['tax-categories'] })
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] })
    },
    onError: (error: Error) => toast.push('Could not save tax category', { description: error.message, tone: 'error' })
  })

  const templateMutation = useMutation({
    mutationFn: () =>
      api<NotificationTemplate>('/api/notifications/templates', {
        method: 'PUT',
        body: {
          event: templateForm.event,
          channel: templateForm.channel,
          subject: templateForm.subject.trim(),
          body: templateForm.body.trim(),
          active: templateForm.active
        }
      }),
    onSuccess: (saved) => {
      toast.push('Template saved', { description: `${titleCase(saved.event)} · ${titleCase(saved.channel)}`, tone: 'success' })
      setTemplateOpen(false)
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] })
    },
    onError: (error: Error) => toast.push('Could not save template', { description: error.message, tone: 'error' })
  })

  const retryMutation = useMutation({
    mutationFn: (id: number) => api<NotificationLog>(`/api/notifications/logs/${id}/retry`, { method: 'POST' }),
    onSuccess: (log) => {
      toast.push('Notification retried', { description: `${titleCase(log.status)} · ${titleCase(log.channel)}`, tone: log.status === 'SENT' ? 'success' : 'warning' })
      queryClient.invalidateQueries({ queryKey: ['notification-logs'] })
    },
    onError: (error: Error) => toast.push('Could not retry notification', { description: error.message, tone: 'error' })
  })

  const createBackupMutation = useMutation({
    mutationFn: () => api<Backup>('/api/backups', { method: 'POST' }),
    onSuccess: (backup) => {
      toast.push(backup.status === 'SUCCESS' ? 'Backup created' : 'Backup finished with issues', {
        description: `${backup.fileName} · ${fileSize(backup.sizeBytes)}`,
        tone: backup.status === 'SUCCESS' ? 'success' : 'warning'
      })
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (error: Error) => toast.push('Could not create backup', { description: error.message, tone: 'error' })
  })

  const restoreMutation = useMutation({
    mutationFn: () =>
      api<Backup>(`/api/backups/${restoreBackup!.id}/restore`, {
        method: 'POST',
        body: {
          confirmation: restoreForm.confirmation.trim(),
          approverUsername: restoreForm.approverUsername.trim(),
          approverPin: restoreForm.approverPin.trim(),
          reason: restoreForm.reason.trim()
        }
      }),
    onSuccess: (backup) => {
      toast.push('Restore started', {
        description: `${backup.fileName} · a pre-restore safety backup was created first.`,
        tone: 'warning'
      })
      setRestoreBackup(null)
      setRestoreForm({ confirmation: '', approverUsername: '', approverPin: '', reason: '' })
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (error: Error) => toast.push('Could not restore backup', { description: error.message, tone: 'error' })
  })

  // ---------- Helpers ----------
  const openBranch = (branch?: Branch) => {
    setBranchEdit(branch ?? null)
    setBranchForm(
      branch
        ? {
            code: branch.code,
            name: branch.name,
            address: branch.address ?? '',
            city: branch.city ?? '',
            state: branch.state ?? '',
            stateCode: branch.stateCode ?? '',
            phone: branch.phone ?? '',
            email: branch.email ?? '',
            gstin: branch.gstin ?? '',
            invoicePrefix: branch.invoicePrefix ?? '',
            primaryBranch: branch.primaryBranch
          }
        : emptyBranchForm()
    )
    setBranchOpen(true)
  }

  const openUser = (row?: User) => {
    setUserEdit(row ?? null)
    setUserForm(
      row
        ? {
            username: row.username,
            email: row.email ?? '',
            password: '',
            fullName: row.fullName,
            phone: row.phone ?? '',
            roleIds: row.roles.map((role) => role.id),
            branchIds: row.branches.map((branch) => branch.id),
            defaultBranchId: row.defaultBranchId ?? row.branches[0]?.id ?? 0,
            pin: '',
            active: row.active
          }
        : {
            ...emptyUserForm(),
            roleIds: roles[0] ? [roles[0].id] : [],
            branchIds: branches[0] ? [branches[0].id] : [],
            defaultBranchId: branches[0]?.id ?? 0
          }
    )
    setUserOpen(true)
  }

  const openRole = (role?: Role) => {
    setRoleEdit(role ?? null)
    setRoleForm(
      role
        ? {
            code: role.code,
            name: role.name,
            description: role.description ?? '',
            discountLimitPercent: String(role.discountLimitPercent ?? 0),
            permissionCodes: role.permissions.map((permission) => permission.code)
          }
        : emptyRoleForm()
    )
    setRoleOpen(true)
  }

  const openTax = (tax?: TaxCategory) => {
    setTaxEdit(tax ?? null)
    setTaxForm(
      tax
        ? {
            name: tax.name,
            hsnCode: tax.hsnCode ?? '',
            gstRate: String(tax.gstRate ?? 0),
            cgstRate: String(tax.cgstRate ?? 0),
            sgstRate: String(tax.sgstRate ?? 0),
            igstRate: String(tax.igstRate ?? 0),
            exempt: tax.exempt,
            taxInclusive: tax.taxInclusive ?? true,
            active: tax.active
          }
        : emptyTaxForm()
    )
    setTaxOpen(true)
  }

  const openTemplate = (template?: NotificationTemplate) => {
    setTemplateForm(
      template
        ? {
            event: template.event,
            channel: template.channel,
            subject: template.subject,
            body: template.body,
            active: template.active
          }
        : emptyTemplateForm()
    )
    setTemplateOpen(true)
  }

  const toggleInList = (list: number[], value: number) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  const togglePermission = (code: string) =>
    setRoleForm((form) => ({
      ...form,
      permissionCodes: form.permissionCodes.includes(code)
        ? form.permissionCodes.filter((item) => item !== code)
        : [...form.permissionCodes, code]
    }))

  const toggleModule = (modulePermissions: PermissionInfo[]) => {
    const codes = modulePermissions.map((permission) => permission.code)
    const allSelected = codes.every((code) => roleForm.permissionCodes.includes(code))
    setRoleForm((form) => ({
      ...form,
      permissionCodes: allSelected
        ? form.permissionCodes.filter((code) => !codes.includes(code))
        : Array.from(new Set([...form.permissionCodes, ...codes]))
    }))
  }

  const restorePhrase = restoreBackup ? `RESTORE ${restoreBackup.fileName}` : ''
  const restoreConfirmed = restoreForm.confirmation.trim().toLowerCase() === restorePhrase.toLowerCase()

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="The shop · settings"
        title="How the business runs"
        description="Business identity, branches, people, tax, messaging and backups. Changes here are audited and take effect immediately."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void businessQuery.refetch()
              void branchesQuery.refetch()
              void usersQuery.refetch()
              void rolesQuery.refetch()
              void taxQuery.refetch()
              void templatesQuery.refetch()
              void backupsQuery.refetch()
            }}
            loading={businessQuery.isFetching || usersQuery.isFetching}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Business" value={authBusiness?.name ?? businessQuery.data?.name ?? '—'} hint={businessQuery.data?.gstEnabled ? `GSTIN ${businessQuery.data.gstin ?? '—'}` : 'GST not enabled'} icon={Building2} tone="accent" />
        <StatCard label="Branches" value={branches.length || authBusiness?.id ? (branches.length || '—') : '—'} hint={`${branches.filter((branch) => branch.active).length} active`} icon={Store} tone="success" />
        <StatCard label="Team" value={users.length || '—'} hint={`${roles.length} roles defined`} icon={Users} tone="info" />
        <StatCard label="Tax categories" value={taxCategories.length || '—'} hint="Rates used by products and POS" icon={Tags} tone="warning" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs className="border-0" items={availableTabs} value={tab} onChange={(value) => setTab(value as Tab)} />
        </div>

        {tab === 'profile' && (
          <div className="grid gap-4 border-t border-line-soft p-4 lg:grid-cols-2">
            <SectionCard title="Your account" description="Identity comes from the user record managed under Users.">
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-ivory-100/50 p-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-50 font-display text-[15px] font-semibold text-terracotta-600">
                    {user?.fullName?.slice(0, 1) ?? '·'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink-900">{user?.fullName}</p>
                    <p className="text-[10.5px] text-ink-400">{user?.username} · {user?.email}</p>
                    <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-terracotta-500">
                      {user?.roles?.join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 text-[11px] text-ink-500 sm:grid-cols-2">
                  <p><span className="font-semibold text-ink-700">Phone:</span> {user?.phone ?? '—'}</p>
                  <p><span className="font-semibold text-ink-700">Discount limit:</span> {Number(user?.discountLimitPercent ?? 0).toFixed(2)}%</p>
                  <p><span className="font-semibold text-ink-700">Branches:</span> {user?.branches?.map((branch) => branch.name).join(', ') || '—'}</p>
                  <p><span className="font-semibold text-ink-700">Default branch:</span> {user?.branches?.find((branch) => branch.id === user?.defaultBranchId)?.name ?? '—'}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Change password" description="Minimum eight characters. You stay signed in on this device.">
              <div className="space-y-3">
                <Field label="Current password" required>
                  <Input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} autoComplete="current-password" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="New password" required>
                    <Input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} autoComplete="new-password" />
                  </Field>
                  <Field label="Confirm new password" required>
                    <Input type="password" value={passwordForm.confirm} onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })} autoComplete="new-password" />
                  </Field>
                </div>
                <Button
                  size="sm"
                  loading={passwordMutation.isPending}
                  disabled={
                    !passwordForm.currentPassword ||
                    passwordForm.newPassword.length < 8 ||
                    passwordForm.newPassword !== passwordForm.confirm
                  }
                  onClick={() => passwordMutation.mutate()}
                >
                  <KeyRound size={13} /> Update password
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="Approval PIN" description="Used to authorise discounts, negative stock, costing changes, cash differences and restores.">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="New PIN" hint="4–6 digits" required>
                    <Input type="password" inputMode="numeric" maxLength={6} value={pinForm.pin} onChange={(event) => setPinForm({ ...pinForm, pin: event.target.value.replace(/\D/g, '') })} />
                  </Field>
                  <Field label="Confirm PIN" required>
                    <Input type="password" inputMode="numeric" maxLength={6} value={pinForm.confirm} onChange={(event) => setPinForm({ ...pinForm, confirm: event.target.value.replace(/\D/g, '') })} />
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="dark"
                  loading={pinMutation.isPending}
                  disabled={pinForm.pin.length < 4 || pinForm.pin !== pinForm.confirm}
                  onClick={() => pinMutation.mutate()}
                >
                  <ShieldCheck size={13} /> Set approval PIN
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="Security notes" description="What the system enforces">
              <ul className="space-y-2 text-[11.5px] leading-5 text-ink-500">
                <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-sage-500" /> Passwords are hashed with BCrypt; sessions use short-lived JWT tokens.</li>
                <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-sage-500" /> Sensitive actions require a separate approval PIN, not just a role.</li>
                <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-sage-500" /> Restores require typed confirmation, approval and a safety backup.</li>
                <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-sage-500" /> Every settings change is written to the audit log.</li>
              </ul>
            </SectionCard>
          </div>
        )}

        {tab === 'offline' && (
          <div className="grid gap-4 border-t border-line-soft p-4 lg:grid-cols-2">
            <SectionCard
              title="Your offline sign-in"
              description="Saved on this device so the counter keeps billing even when the server is down."
            >
              {myOfflineRecord ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-sage-500/30 bg-sage-500/10 px-3 py-2.5">
                    <CheckCircle2 size={15} className="shrink-0 text-sage-500" />
                    <p className="text-[11px] leading-4 text-ink-700">
                      <span className="font-semibold">Ready on this device</span>
                      <br />Last refreshed {formatDateTime(myOfflineRecord.cachedAt)}
                      {myOfflineRecord.hasPin ? ' · counter PIN enabled' : ' · password only'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Counter PIN" hint="4–6 digits">
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={offlinePinForm.pin}
                        onChange={(event) => setOfflinePinForm({ ...offlinePinForm, pin: event.target.value.replace(/\D/g, '') })}
                        placeholder={myOfflineRecord.hasPin ? 'Set a new PIN…' : 'e.g. 4826'}
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Confirm PIN">
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={offlinePinForm.confirm}
                        onChange={(event) => setOfflinePinForm({ ...offlinePinForm, confirm: event.target.value.replace(/\D/g, '') })}
                        placeholder="Repeat PIN"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={offlinePinForm.pin.length < 4 || offlinePinForm.pin.length > 6 || offlinePinForm.pin !== offlinePinForm.confirm}
                      loading={offlineBusy}
                      onClick={() => {
                        if (!user?.username) return
                        setOfflineBusy(true)
                        void setOfflinePin(user.username, offlinePinForm.pin)
                          .then(() => {
                            toast.push('Counter PIN saved', {
                              description: 'Use this PIN to unlock the counter while the server is down.',
                              tone: 'success'
                            })
                            setOfflinePinForm({ pin: '', confirm: '' })
                            setOfflineRefresh((value) => value + 1)
                          })
                          .catch((error: unknown) => {
                            toast.push('PIN not saved', {
                              description: error instanceof Error ? error.message : 'Please try again.',
                              tone: 'error'
                            })
                          })
                          .finally(() => setOfflineBusy(false))
                      }}
                    >
                      <CloudOff size={13} /> Save counter PIN
                    </Button>
                    {myOfflineRecord.hasPin && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={offlineBusy}
                        onClick={() => {
                          if (!user?.username) return
                          setOfflineBusy(true)
                          void setOfflinePin(user.username, '')
                            .then(() => {
                              toast.push('Counter PIN removed', { description: 'Password is required for offline sign-in.', tone: 'info' })
                              setOfflineRefresh((value) => value + 1)
                            })
                            .catch(() => toast.push('Could not remove PIN', { tone: 'error', description: 'Device storage is unavailable.' }))
                            .finally(() => setOfflineBusy(false))
                        }}
                      >
                        Remove PIN
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-line bg-ivory-100/40 px-3 py-3 text-[11.5px] leading-5 text-ink-500">
                  No offline copy of your account on this device yet. Sign out and sign in once while the server is
                  running — your sign-in will be saved automatically.
                </p>
              )}

              <ul className="mt-3 space-y-2 text-[11px] leading-5 text-ink-500">
                <li className="flex gap-2"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-sage-500" /> Stored on this device as salted hashes — your password is never saved.</li>
                <li className="flex gap-2"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-sage-500" /> If the server cannot be reached, the login screen opens the counter with your password or counter PIN.</li>
                <li className="flex gap-2"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-sage-500" /> Wrong entry 5 times locks offline sign-in for 30 seconds.</li>
              </ul>
            </SectionCard>

            <SectionCard title="Device sign-ins" description="Offline copies stored on this terminal. Only the account owner can set a PIN — a PIN is like a password.">
              {offlineUsers.length === 0 ? (
                <p className="text-[12px] leading-5 text-ink-400">
                  Nothing is cached on this device yet. The first online sign-in for each staff member will appear
                  here.
                </p>
              ) : (
                <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
                  {offlineUsers.map((row) => {
                    const isYou = Boolean(user?.username && row.username.toLowerCase() === user.username.toLowerCase())
                    return (
                      <li key={row.username} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ivory-200 text-[11px] font-bold text-ink-600">
                          {row.fullName.split(' ').map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-ink-800">{row.fullName}</span>
                          <span className="block truncate text-[9.5px] text-ink-400">
                            @{row.username} · cached {formatDateTime(row.cachedAt)}
                          </span>
                        </span>
                        <span className="hidden shrink-0 rounded-md border border-line bg-ivory-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-500 sm:block">
                          {row.hasPin ? 'Password + PIN' : 'Password'}
                        </span>
                        {isYou ? (
                          <span className="shrink-0 rounded-md bg-terracotta-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-terracotta-600">
                            You
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="Remove this offline sign-in from the device"
                            aria-label={`Forget offline sign-in for ${row.username}`}
                            onClick={() => {
                              void forgetOfflineUser(row.username)
                                .then(() => {
                                  toast.push('Removed', {
                                    description: `${row.fullName} must sign in with the server once to use this device again.`,
                                    tone: 'info'
                                  })
                                  setOfflineRefresh((value) => value + 1)
                                })
                                .catch(() => toast.push('Could not forget sign-in', { description: 'Device storage is unavailable.', tone: 'error' }))
                            }}
                            className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-brick-100 hover:text-brick-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="mt-4 border-t border-line-soft pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brick-500">Danger zone</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-500">
                  Use this when handing the terminal to someone else or after a password leak. No queued bills are lost.
                  Also run this if a role is revoked, an account is disabled, or a password is reset while the server is
                  unreachable — offline sign-ins cannot reach the server to find out.
                </p>
                {forgetAllArmed ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-brick-500 text-ivory-50 hover:bg-brick-600"
                      onClick={() => {
                        void clearOfflineUsers()
                          .then(() => {
                            toast.push('All offline sign-ins forgotten', {
                              description: 'No one can sign in on this device while the server is down.',
                              tone: 'info'
                            })
                            setForgetAllArmed(false)
                            setOfflineRefresh((value) => value + 1)
                          })
                          .catch(() => toast.push('Could not clear', { description: 'Device storage is unavailable.', tone: 'error' }))
                      }}
                    >
                      <Trash2 size={13} /> Confirm forget all
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setForgetAllArmed(false)}>
                      Keep them
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => setForgetAllArmed(true)}>
                    <Trash2 size={13} /> Forget ALL offline sign-ins
                  </Button>
                )}
              </div>
            </SectionCard>
          </div>
        )}

        {tab === 'business' && (
          <div className="border-t border-line-soft">
            {businessQuery.isLoading || !businessForm ? (
              <LoadingBlock label="Reading business settings…" />
            ) : businessQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load business settings" description={(businessQuery.error as Error).message} />
            ) : (
              <div className="space-y-4 p-4">
                <SectionCard title="Identity" description="Appears on invoices, reports and customer messages.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Business name" required>
                      <Input value={businessForm.name} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })} />
                    </Field>
                    <Field label="Legal name">
                      <Input value={businessForm.legalName} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, legalName: event.target.value })} />
                    </Field>
                    <Field label="GSTIN">
                      <Input value={businessForm.gstin} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, gstin: event.target.value.toUpperCase() })} placeholder="27ABCDE1234F1Z5" />
                    </Field>
                    <Field label="State code">
                      <Input value={businessForm.stateCode} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, stateCode: event.target.value })} placeholder="27" />
                    </Field>
                    <Field label="Phone">
                      <Input value={businessForm.phone} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, phone: event.target.value })} />
                    </Field>
                    <Field label="Email">
                      <Input type="email" value={businessForm.email} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, email: event.target.value })} />
                    </Field>
                    <Field label="Address" className="sm:col-span-2">
                      <Textarea value={businessForm.address} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, address: event.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-3">
                    <Checkbox
                      label="GST is enabled for this business"
                      checked={businessForm.gstEnabled}
                      disabled={!has('settings.manage')}
                      onChange={(event) => setBusinessForm({ ...businessForm, gstEnabled: event.target.checked })}
                    />
                  </div>
                </SectionCard>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SectionCard title="Numbering & financial year" description="Invoice numbers are per branch and financial year.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Invoice prefix" required hint="Letters/numbers">
                        <Input value={businessForm.invoicePrefix} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, invoicePrefix: event.target.value.toUpperCase() })} />
                      </Field>
                      <Field label="Financial year starts" required>
                        <Select value={businessForm.financialYearStartMonth} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, financialYearStartMonth: event.target.value })}>
                          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                            <option key={month} value={month}>
                              {new Date(2000, month - 1, 1).toLocaleString('en-IN', { month: 'long' })}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Timezone" hint="IANA name">
                        <Input value={businessForm.timezone} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, timezone: event.target.value })} placeholder="Asia/Kolkata" />
                      </Field>
                      <Field label="Costing method" hint="Change in Inventory with approval">
                        <Input value={titleCase(businessForm.costingMethod)} disabled />
                      </Field>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Checkbox label="Round invoice totals to the nearest rupee" checked={businessForm.roundOffEnabled} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, roundOffEnabled: event.target.checked })} />
                      <Checkbox label="Prices include GST by default" checked={businessForm.defaultTaxInclusive} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, defaultTaxInclusive: event.target.checked })} />
                    </div>
                  </SectionCard>

                  <SectionCard title="Selling rules" description="Applied by the POS and server-side validation.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Maximum discount %" required>
                        <Input type="number" min={0} max={100} step="0.01" value={businessForm.maxDiscountPercent} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, maxDiscountPercent: event.target.value })} />
                      </Field>
                      <Field label="Return window (days)" required>
                        <Input type="number" min={0} max={365} value={businessForm.returnWindowDays} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, returnWindowDays: event.target.value })} />
                      </Field>
                      <Field label="Exchange window (days)" required>
                        <Input type="number" min={0} max={365} value={businessForm.exchangeWindowDays} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, exchangeWindowDays: event.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Checkbox label="Returns require manager approval" checked={businessForm.returnApprovalRequired} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, returnApprovalRequired: event.target.checked })} />
                      <Checkbox label="Refund only to the original payment method" checked={businessForm.refundToOriginalMethodOnly} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, refundToOriginalMethodOnly: event.target.checked })} />
                      <Checkbox label="Allow negative stock with an approval PIN" checked={businessForm.allowNegativeStockWithApproval} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, allowNegativeStockWithApproval: event.target.checked })} />
                    </div>
                  </SectionCard>
                </div>

                {has('settings.manage') && (
                  <div className="flex justify-end">
                    <Button loading={businessMutation.isPending} onClick={() => businessMutation.mutate()}>
                      <Save size={14} /> Save business settings
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'print' && (
          <div className="border-t border-line-soft">
            {businessQuery.isLoading || !businessForm ? (
              <LoadingBlock label="Reading bill print settings..." />
            ) : businessQuery.isError ? (
              <EmptyState icon={ReceiptText} title="Could not load bill print settings" description={(businessQuery.error as Error).message} />
            ) : (
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <SectionCard title="What appears on the printed bill" description="Every printed bill and downloaded PDF shows these details. Edit them once here.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Shop name" required hint="Header of every bill" className="sm:col-span-2">
                        <Input value={businessForm.name} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })} />
                      </Field>
                      <Field label="Address" hint="Line by line, printed under the shop name" className="sm:col-span-2">
                        <Textarea value={businessForm.address} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, address: event.target.value })} />
                      </Field>
                      <Field label="Contact number" hint="Phone printed with the address">
                        <Input value={businessForm.phone} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, phone: event.target.value })} />
                      </Field>
                      <Field label="Bill number shows prefix">
                        <Input value={businessForm.invoicePrefix} disabled={!has('settings.manage')} onChange={(event) => setBusinessForm({ ...businessForm, invoicePrefix: event.target.value.toUpperCase() })} />
                      </Field>
                      <Field
                        label="Thank-you note (bottom of bill)"
                        hint="Closing line, printed at the bottom"
                        className="sm:col-span-2"
                      >
                        <Textarea
                          value={businessForm.thankYouNote}
                          disabled={!has('settings.manage')}
                          onChange={(event) => setBusinessForm({ ...businessForm, thankYouNote: event.target.value })}
                          placeholder="Thank you for shopping with us!"
                        />
                      </Field>
                    </div>
                    <p className="mt-3 text-[10.5px] leading-4 text-ink-400">
                      Each bill always prints: bill number, date, seller (billed by), customer name and all product details, plus these shop details and the thank-you note.
                    </p>
                  </SectionCard>

                  {has('settings.manage') && (
                    <div className="flex justify-end">
                      <Button loading={businessMutation.isPending} onClick={() => businessMutation.mutate()}>
                        <Save size={14} /> Save bill print settings
                      </Button>
                    </div>
                  )}
                </div>

                {/* Live preview */}
                <SectionCard title="Preview" description="Follows the values on the left.">
                  <div className="mx-auto w-full max-w-[260px] rounded-lg border border-line bg-white p-3.5 font-mono text-[10px] leading-4 text-ink-800 shadow-sm">
                    <p className="text-center font-display text-[13px] font-bold tracking-wide text-ink-900">{businessForm.name || 'Shop name'}</p>
                    {(businessForm.address ?? '').split('\n').filter(Boolean).map((line, index) => (
                      <p key={index} className="text-center text-[9px] text-ink-500">{line}</p>
                    ))}
                    {businessForm.phone && <p className="text-center text-[9px] text-ink-500">Contact: {businessForm.phone}</p>}
                    <p className="my-2 border-t border-dashed border-ink-300" />
                    <div className="flex justify-between"><span>Bill No</span><span className="font-bold">{businessForm.invoicePrefix}/2026-27/000123</span></div>
                    <div className="flex justify-between"><span>Date</span><span>{new Date().toLocaleDateString('en-IN')}</span></div>
                    <div className="flex justify-between mt-1"><span>Billed by</span><span className="font-bold">{user?.fullName}</span></div>
                    <div className="flex justify-between"><span>Customer</span><span>Walk-in customer</span></div>
                    <p className="my-2 border-t border-dashed border-ink-300" />
                    <div className="flex justify-between"><span>Sample item x 1</span><span>1,099.00</span></div>
                    <div className="mt-1.5 border-t border-dashed border-ink-300" />
                    <div className="flex justify-between font-bold"><span>TOTAL</span><span>1,076.00</span></div>
                    <p className="mt-2 border-t border-dashed border-ink-300 pt-1.5 text-center italic text-ink-600">
                      {businessForm.thankYouNote.trim() || 'Thank you for shopping with us!'}
                    </p>
                  </div>
                </SectionCard>
              </div>
            )}
          </div>
        )}

        {tab === 'branches' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Each branch keeps its own stock, invoice sequence, cash sessions and device registrations.
              </p>
              {has('branch.manage') && (
                <Button size="sm" onClick={() => openBranch()}>
                  <Plus size={12} /> New branch
                </Button>
              )}
            </div>
            {branchesQuery.isLoading ? (
              <LoadingBlock label="Reading branches…" />
            ) : branches.length === 0 ? (
              <EmptyState icon={Store} title="No branches yet" description="Create the first branch to start selling." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Branch</TH>
                    <TH>Location</TH>
                    <TH>GSTIN</TH>
                    <TH>Invoice prefix</TH>
                    <TH align="right">Primary</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {branches.map((branch) => (
                    <TR key={branch.id}>
                      <TD>
                        <span className="block text-[12px] font-semibold text-ink-800">{branch.name}</span>
                        <span className="block font-mono text-[9.5px] text-ink-400">{branch.code}</span>
                      </TD>
                      <TD className="text-[11px] text-ink-500">
                        <span className="block">{branch.city ?? '—'}</span>
                        <span className="block text-[10px] text-ink-400">{branch.state ?? '—'} {branch.stateCode ? `(${branch.stateCode})` : ''}</span>
                      </TD>
                      <TD className="font-mono text-[10px] text-ink-500">{branch.gstin ?? '—'}</TD>
                      <TD className="font-mono text-[10px] text-ink-500">{branch.invoicePrefix ?? '—'}</TD>
                      <TD align="right">{branch.primaryBranch ? <Badge tone="accent">Primary</Badge> : <span className="text-[10px] text-ink-300">—</span>}</TD>
                      <TD align="right"><Badge tone={branch.active ? 'success' : 'danger'} dot>{branch.active ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          {has('branch.manage') && (
                            <>
                              <IconButton label="Edit branch" onClick={() => openBranch(branch)}>
                                <Pencil size={14} />
                              </IconButton>
                              <Button
                                size="sm"
                                variant={branch.active ? 'ghost' : 'secondary'}
                                loading={branchStatusMutation.isPending}
                                onClick={() => branchStatusMutation.mutate({ id: branch.id, active: !branch.active })}
                              >
                                {branch.active ? 'Deactivate' : 'Activate'}
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Users belong to roles and branches. Approval PINs are separate from passwords.
              </p>
              {has('user.manage') && (
                <Button size="sm" onClick={() => openUser()}>
                  <Plus size={12} /> New user
                </Button>
              )}
            </div>
            {!has('user.view') ? (
              <EmptyState icon={LockKeyhole} title="User list needs user view access" />
            ) : usersQuery.isLoading ? (
              <LoadingBlock label="Reading the team…" />
            ) : users.length === 0 ? (
              <EmptyState icon={Users} title="No users" description="Create the first staff account." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>User</TH>
                    <TH>Roles</TH>
                    <TH>Branches</TH>
                    <TH align="right">PIN</TH>
                    <TH align="right">Last login</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {users.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <span className="block text-[12px] font-semibold text-ink-800">{row.fullName}</span>
                        <span className="block text-[9.5px] text-ink-400">{row.username} · {row.email ?? 'no email'}</span>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {row.roles.map((role) => (
                            <Badge key={role.id} tone="info">{role.name}</Badge>
                          ))}
                        </div>
                      </TD>
                      <TD className="text-[10.5px] text-ink-500">
                        {row.branches.map((branch) => branch.code).join(', ') || '—'}
                        {row.defaultBranchId && (
                          <span className="block text-[9px] text-ink-400">
                            default: {row.branches.find((branch) => branch.id === row.defaultBranchId)?.code ?? '—'}
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        <Badge tone={row.hasPin ? 'success' : 'warning'}>{row.hasPin ? 'Set' : 'Missing'}</Badge>
                      </TD>
                      <TD align="right" className="text-[10px] text-ink-400">{row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never'}</TD>
                      <TD align="right"><Badge tone={row.active ? 'success' : 'danger'} dot>{row.active ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD align="right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {has('user.manage') && (
                            <>
                              <IconButton label="Edit user" onClick={() => openUser(row)}>
                                <Pencil size={14} />
                              </IconButton>
                              <Button size="sm" variant="ghost" onClick={() => { setPasswordUser(row); setNewPassword('') }}>
                                Password
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setPinUser(row); setUserPin('') }}>
                                PIN
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'roles' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Permissions are enforced by the server. Discount limits cap what a role can approve at the till.
              </p>
              {has('role.manage') && (
                <Button size="sm" onClick={() => openRole()}>
                  <Plus size={12} /> New role
                </Button>
              )}
            </div>
            {rolesQuery.isLoading ? (
              <LoadingBlock label="Reading roles…" />
            ) : roles.length === 0 ? (
              <EmptyState icon={UserCog} title="No roles" />
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {roles.map((role) => (
                  <div key={role.id} className="rounded-xl border border-line-soft bg-ivory-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-[15px] font-semibold text-ink-900">{role.name}</p>
                        <p className="font-mono text-[9.5px] text-ink-400">{role.code}</p>
                      </div>
                      {role.systemRole && <Badge tone="info">System</Badge>}
                    </div>
                    <p className="mt-2 min-h-[32px] text-[10.5px] leading-4 text-ink-500">{role.description ?? 'No description.'}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2.5">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">Discount limit</p>
                        <p className="num text-[12px] font-semibold text-ink-800">{Number(role.discountLimitPercent).toFixed(2)}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">Permissions</p>
                        <p className="num text-[12px] font-semibold text-ink-800">{role.permissions.length}</p>
                      </div>
                      {has('role.manage') && (
                        <IconButton label="Edit role" onClick={() => openRole(role)}>
                          <Pencil size={14} />
                        </IconButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'tax' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Tax categories hold the GST slab, HSN code and inclusive/exclusive default used by products.
              </p>
              {has('tax.manage') && (
                <Button size="sm" onClick={() => openTax()}>
                  <Plus size={12} /> New tax category
                </Button>
              )}
            </div>
            {taxQuery.isLoading ? (
              <LoadingBlock label="Reading tax categories…" />
            ) : taxCategories.length === 0 ? (
              <EmptyState icon={Tags} title="No tax categories" description="Add the GST slabs your products use." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH>HSN</TH>
                    <TH align="right">GST</TH>
                    <TH align="right">CGST</TH>
                    <TH align="right">SGST</TH>
                    <TH align="right">IGST</TH>
                    <TH align="right">Pricing</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </THead>
                <tbody>
                  {taxCategories.map((tax) => (
                    <TR key={tax.id}>
                      <TD className="text-[12px] font-semibold text-ink-800">{tax.name}</TD>
                      <TD className="font-mono text-[10px] text-ink-500">{tax.hsnCode ?? '—'}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-800">{Number(tax.gstRate).toFixed(2)}%</TD>
                      <TD align="right" className="num text-[11px] text-ink-500">{Number(tax.cgstRate).toFixed(2)}%</TD>
                      <TD align="right" className="num text-[11px] text-ink-500">{Number(tax.sgstRate).toFixed(2)}%</TD>
                      <TD align="right" className="num text-[11px] text-ink-500">{Number(tax.igstRate).toFixed(2)}%</TD>
                      <TD align="right">
                        <Badge tone={tax.exempt ? 'info' : 'neutral'}>{tax.exempt ? 'Exempt' : tax.taxInclusive ? 'Inclusive' : 'Exclusive'}</Badge>
                      </TD>
                      <TD align="right"><Badge tone={tax.active ? 'success' : 'danger'} dot>{tax.active ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD align="right">
                        {has('tax.manage') && (
                          <IconButton label="Edit tax category" onClick={() => openTax(tax)}>
                            <Pencil size={14} />
                          </IconButton>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="border-t border-line-soft">
            <div className="space-y-4 p-4">
              <SectionCard
                title="Message templates"
                description="Templates are matched by event and channel. Disabled or unconfigured providers are recorded as skipped, never as sent."
                action={
                  has('notification.manage') ? (
                    <Button size="sm" variant="secondary" onClick={() => openTemplate()}>
                      <Plus size={12} /> New template
                    </Button>
                  ) : undefined
                }
                bodyClassName="p-0"
              >
                {templatesQuery.isLoading ? (
                  <LoadingBlock label="Reading templates…" />
                ) : templates.length === 0 ? (
                  <EmptyState icon={BellRing} title="No templates" description="Add an invoice confirmation template to start messaging customers." />
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <TH>Event</TH>
                        <TH>Channel</TH>
                        <TH>Subject</TH>
                        <TH>Body preview</TH>
                        <TH align="right">Status</TH>
                        <TH align="right">Action</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {templates.map((template) => (
                        <TR key={template.id}>
                          <TD className="text-[11.5px] font-semibold text-ink-800">{titleCase(template.event)}</TD>
                          <TD><Badge tone="info">{titleCase(template.channel)}</Badge></TD>
                          <TD className="max-w-[200px] truncate text-[11px] text-ink-600">{template.subject}</TD>
                          <TD className="max-w-[280px] truncate text-[10.5px] text-ink-400">{template.body}</TD>
                          <TD align="right"><Badge tone={template.active ? 'success' : 'danger'} dot>{template.active ? 'Active' : 'Inactive'}</Badge></TD>
                          <TD align="right">
                            {has('notification.manage') && (
                              <IconButton label="Edit template" onClick={() => openTemplate(template)}>
                                <Pencil size={14} />
                              </IconButton>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                )}
              </SectionCard>

              <SectionCard title="Delivery log" description="What was attempted, through which provider, and why it failed." bodyClassName="p-0">
                {logsQuery.isLoading ? (
                  <LoadingBlock label="Reading notification log…" />
                ) : logs.length === 0 ? (
                  <EmptyState icon={Mail} title="No notifications yet" description="Invoice confirmations and payment reminders will appear here." />
                ) : (
                  <>
                    <Table>
                      <THead>
                        <tr>
                          <TH>When</TH>
                          <TH>Event</TH>
                          <TH>Channel</TH>
                          <TH>Recipient</TH>
                          <TH>Message</TH>
                          <TH align="right">Status</TH>
                          <TH align="right">Action</TH>
                        </tr>
                      </THead>
                      <tbody>
                        {logs.map((log) => (
                          <TR key={log.id}>
                            <TD className="whitespace-nowrap text-[10px] text-ink-400">{formatDateTime(log.createdAt)}</TD>
                            <TD className="text-[10.5px] text-ink-600">{titleCase(log.event)}</TD>
                            <TD><Badge tone="info">{titleCase(log.channel)}</Badge></TD>
                            <TD className="text-[10.5px] text-ink-500">{log.recipient ?? '—'}</TD>
                            <TD className="max-w-[240px] truncate text-[10.5px] text-ink-500">
                              {log.message}
                              {log.errorMessage && <span className="block text-[9px] text-brick-500">{log.errorMessage}</span>}
                            </TD>
                            <TD align="right"><Badge tone={statusTone(log.status)} dot>{titleCase(log.status)}</Badge></TD>
                            <TD align="right">
                              {has('notification.manage') && ['FAILED', 'SKIPPED'].includes(log.status) && (
                                <Button size="sm" variant="ghost" loading={retryMutation.isPending} onClick={() => retryMutation.mutate(log.id)}>
                                  <RotateCcw size={12} /> Retry
                                </Button>
                              )}
                            </TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                    <Pagination
                      page={logPage}
                      totalPages={logsQuery.data?.totalPages ?? 0}
                      totalElements={logsQuery.data?.totalElements ?? 0}
                      onChange={setLogPage}
                    />
                  </>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        {tab === 'backups' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Backups use the configured database tools. Restores create a safety backup first and require an approval PIN.
              </p>
              {canBackups && (
                <Button size="sm" loading={createBackupMutation.isPending} onClick={() => createBackupMutation.mutate()}>
                  <DatabaseBackup size={12} /> Create backup
                </Button>
              )}
            </div>
            {backupsQuery.isLoading ? (
              <LoadingBlock label="Reading backup history…" />
            ) : backups.length === 0 ? (
              <EmptyState icon={DatabaseBackup} title="No backups yet" description="Create a manual backup before major changes or upgrades." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>File</TH>
                    <TH>Type</TH>
                    <TH align="right">Size</TH>
                    <TH>Started</TH>
                    <TH>Finished</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {backups.map((backup) => (
                    <TR key={backup.id}>
                      <TD>
                        <span className="block max-w-[280px] truncate font-mono text-[10.5px] text-ink-700">{backup.fileName}</span>
                        {backup.checksum && <span className="block max-w-[280px] truncate text-[9px] text-ink-400">SHA-256 {backup.checksum.slice(0, 16)}…</span>}
                      </TD>
                      <TD><Badge tone="info">{titleCase(backup.type)}</Badge></TD>
                      <TD align="right" className="num text-[10.5px] text-ink-500">{fileSize(backup.sizeBytes)}</TD>
                      <TD className="whitespace-nowrap text-[10px] text-ink-400">{formatDateTime(backup.startedAt)}</TD>
                      <TD className="whitespace-nowrap text-[10px] text-ink-400">{backup.finishedAt ? formatDateTime(backup.finishedAt) : '—'}</TD>
                      <TD align="right"><Badge tone={statusTone(backup.status)} dot>{titleCase(backup.status)}</Badge></TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={backup.status !== 'SUCCESS'}
                            onClick={() => downloadFile(`/api/backups/${backup.id}/download`, backup.fileName).catch((error: Error) => toast.push('Download failed', { description: error.message, tone: 'error' }))}
                          >
                            <Download size={12} /> Download
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={backup.status !== 'SUCCESS' || backup.type === 'RESTORE'}
                            onClick={() => {
                              setRestoreBackup(backup)
                              setRestoreForm({ confirmation: '', approverUsername: '', approverPin: '', reason: '' })
                            }}
                          >
                            <RotateCcw size={12} /> Restore
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            <div className="border-t border-line-soft bg-brick-100/30 px-4 py-3 text-[10.5px] leading-4 text-brick-600">
              Restoring replaces live data with the selected snapshot. Take a fresh backup and inform staff before restoring.
            </div>
          </div>
        )}
      </Card>

      <SectionCard className="mt-4" title="Configuration that stays honest" description="No hardcoded business facts">
        <div className="grid gap-3 text-[11.5px] leading-5 text-ink-500 sm:grid-cols-3">
          <p><span className="font-semibold text-ink-700">Tax and numbering</span> come from this business record, not from the source code. Branch invoice prefixes create independent sequences.</p>
          <p><span className="font-semibold text-ink-700">Approval PINs</span> gate discounts, stock adjustments, costing changes, cash differences and restores.</p>
          <p><span className="font-semibold text-ink-700">Audit logging</span> records settings changes, user changes, backups and restores with the acting user.</p>
        </div>
      </SectionCard>

      {/* ---------- Branch modal ---------- */}
      <Modal
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={branchEdit ? 'Edit branch' : 'New branch'}
        description="Stock, cash sessions and invoice sequences are isolated per branch."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setBranchOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={branchMutation.isPending}
              disabled={!branchForm.code.trim() || !branchForm.name.trim() || !branchForm.invoicePrefix.trim()}
              onClick={() => branchMutation.mutate()}
            >
              {branchEdit ? 'Save branch' : 'Create branch'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Branch code" required>
              <Input value={branchForm.code} onChange={(event) => setBranchForm({ ...branchForm, code: event.target.value.toUpperCase() })} placeholder="BANER" />
            </Field>
            <Field label="Branch name" required className="sm:col-span-2">
              <Input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} placeholder="Aarohi Garments - Baner" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City">
              <Input value={branchForm.city} onChange={(event) => setBranchForm({ ...branchForm, city: event.target.value })} />
            </Field>
            <Field label="State">
              <Input value={branchForm.state} onChange={(event) => setBranchForm({ ...branchForm, state: event.target.value })} />
            </Field>
            <Field label="State code">
              <Input value={branchForm.stateCode} onChange={(event) => setBranchForm({ ...branchForm, stateCode: event.target.value })} placeholder="27" />
            </Field>
          </div>
          <Field label="Address">
            <Textarea value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Phone">
              <Input value={branchForm.phone} onChange={(event) => setBranchForm({ ...branchForm, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={branchForm.email} onChange={(event) => setBranchForm({ ...branchForm, email: event.target.value })} />
            </Field>
            <Field label="GSTIN">
              <Input value={branchForm.gstin} onChange={(event) => setBranchForm({ ...branchForm, gstin: event.target.value.toUpperCase() })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Invoice prefix" required hint="Per-branch sequence">
              <Input value={branchForm.invoicePrefix} onChange={(event) => setBranchForm({ ...branchForm, invoicePrefix: event.target.value.toUpperCase() })} placeholder="AGM" />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox label="Primary branch" checked={branchForm.primaryBranch} onChange={(event) => setBranchForm({ ...branchForm, primaryBranch: event.target.checked })} />
            </div>
          </div>
        </div>
      </Modal>

      {/* ---------- User modal ---------- */}
      <Modal
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title={userEdit ? 'Edit user' : 'New user'}
        description={userEdit ? 'Roles and branches can change. Passwords and PINs are reset separately.' : 'Create a staff account with its roles, branches and optional approval PIN.'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setUserOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={userMutation.isPending}
              disabled={
                !userForm.fullName.trim() ||
                !userForm.email.trim() ||
                userForm.roleIds.length === 0 ||
                userForm.branchIds.length === 0 ||
                (!userEdit && (!userForm.username.trim() || userForm.password.length < 8))
              }
              onClick={() => userMutation.mutate()}
            >
              {userEdit ? 'Save user' : 'Create user'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username" required>
              <Input value={userForm.username} disabled={userEdit != null} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} placeholder="cashier.baner" />
            </Field>
            <Field label="Full name" required>
              <Input value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} placeholder="Meera Joshi" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" required>
              <Input type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} />
            </Field>
          </div>
          {!userEdit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Temporary password" required hint="Minimum 8 characters">
                <Input type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Approval PIN" hint="Optional, 4–6 digits">
                <Input type="password" inputMode="numeric" maxLength={6} value={userForm.pin} onChange={(event) => setUserForm({ ...userForm, pin: event.target.value.replace(/\D/g, '') })} />
              </Field>
            </div>
          )}
          {userEdit && (
            <Checkbox label="User is active" checked={userForm.active} onChange={(event) => setUserForm({ ...userForm, active: event.target.checked })} />
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Roles <span className="text-terracotta-500">*</span></p>
            <div className="grid gap-2 rounded-xl border border-line-soft p-3 sm:grid-cols-2">
              {roles.map((role) => (
                <Checkbox
                  key={role.id}
                  label={
                    <span>
                      <span className="block text-[12px] font-semibold text-ink-800">{role.name}</span>
                      <span className="block text-[9.5px] text-ink-400">{role.permissions.length} permissions · {Number(role.discountLimitPercent).toFixed(1)}% discount</span>
                    </span>
                  }
                  checked={userForm.roleIds.includes(role.id)}
                  onChange={() => setUserForm({ ...userForm, roleIds: toggleInList(userForm.roleIds, role.id) })}
                />
              ))}
              {roles.length === 0 && <p className="text-[11px] text-ink-400">No roles available.</p>}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Branches <span className="text-terracotta-500">*</span></p>
            <div className="grid gap-2 rounded-xl border border-line-soft p-3 sm:grid-cols-2">
              {branches.map((branch) => (
                <Checkbox
                  key={branch.id}
                  label={
                    <span>
                      <span className="block text-[12px] font-semibold text-ink-800">{branch.name}</span>
                      <span className="block text-[9.5px] text-ink-400">{branch.code} · {branch.city ?? '—'}</span>
                    </span>
                  }
                  checked={userForm.branchIds.includes(branch.id)}
                  onChange={() => {
                    const next = toggleInList(userForm.branchIds, branch.id)
                    setUserForm({
                      ...userForm,
                      branchIds: next,
                      defaultBranchId: next.includes(userForm.defaultBranchId) ? userForm.defaultBranchId : next[0] ?? 0
                    })
                  }}
                />
              ))}
              {branches.length === 0 && <p className="text-[11px] text-ink-400">No branches available.</p>}
            </div>
          </div>

          <Field label="Default branch">
            <Select
              value={userForm.defaultBranchId}
              onChange={(event) => setUserForm({ ...userForm, defaultBranchId: Number(event.target.value) })}
            >
              <option value={0}>First selected branch</option>
              {branches
                .filter((branch) => userForm.branchIds.includes(branch.id))
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* ---------- Reset password / PIN modals ---------- */}
      <Modal
        open={passwordUser != null}
        onClose={() => setPasswordUser(null)}
        title="Reset password"
        description={passwordUser ? `${passwordUser.fullName} · ${passwordUser.username}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPasswordUser(null)}>Cancel</Button>
            <Button size="sm" loading={resetPasswordMutation.isPending} disabled={newPassword.length < 8} onClick={() => resetPasswordMutation.mutate()}>
              Reset password
            </Button>
          </>
        }
      >
        <Field label="New password" required hint="Minimum 8 characters">
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </Field>
      </Modal>

      <Modal
        open={pinUser != null}
        onClose={() => setPinUser(null)}
        title="Set approval PIN"
        description={pinUser ? `${pinUser.fullName} · ${pinUser.username}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPinUser(null)}>Cancel</Button>
            <Button size="sm" loading={setUserPinMutation.isPending} disabled={userPin.length < 4} onClick={() => setUserPinMutation.mutate()}>
              Set PIN
            </Button>
          </>
        }
      >
        <Field label="PIN" required hint="4–6 digits">
          <Input type="password" inputMode="numeric" maxLength={6} value={userPin} onChange={(event) => setUserPin(event.target.value.replace(/\D/g, ''))} />
        </Field>
      </Modal>

      {/* ---------- Role modal ---------- */}
      <Modal
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title={roleEdit ? 'Edit role' : 'New role'}
        description="Permissions are checked on every API call. Discount limits are enforced at the point of sale."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={roleMutation.isPending}
              disabled={!roleForm.name.trim() || roleForm.permissionCodes.length === 0 || (!roleEdit && !roleForm.code.trim())}
              onClick={() => roleMutation.mutate()}
            >
              {roleEdit ? 'Save role' : 'Create role'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Role code" required hint={roleEdit ? 'Locked' : 'Letters, numbers, underscore'}>
              <Input value={roleForm.code} disabled={roleEdit != null} onChange={(event) => setRoleForm({ ...roleForm, code: event.target.value.toUpperCase() })} placeholder="STORE_MANAGER" />
            </Field>
            <Field label="Role name" required className="sm:col-span-2">
              <Input value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} placeholder="Store manager" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount limit %" hint="0–100">
              <Input type="number" min={0} max={100} step="0.01" value={roleForm.discountLimitPercent} onChange={(event) => setRoleForm({ ...roleForm, discountLimitPercent: event.target.value })} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Permissions <span className="text-terracotta-500">*</span></p>
              <span className="num text-[10.5px] text-ink-400">{roleForm.permissionCodes.length} selected</span>
            </div>
            {permissionsQuery.isLoading ? (
              <LoadingBlock label="Reading permissions…" />
            ) : (
              <div className="space-y-2">
                {permissionGroups.map(([module, modulePermissions]) => {
                  const allSelected = modulePermissions.every((permission) => roleForm.permissionCodes.includes(permission.code))
                  return (
                    <div key={module} className="overflow-hidden rounded-xl border border-line-soft">
                      <div className="flex items-center justify-between border-b border-line-soft bg-ivory-100/60 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500">{titleCase(module)}</p>
                        <Button size="sm" variant="ghost" onClick={() => toggleModule(modulePermissions)}>
                          {allSelected ? 'Clear' : 'Select all'}
                        </Button>
                      </div>
                      <div className="grid gap-2 p-3 sm:grid-cols-2">
                        {modulePermissions.map((permission) => (
                          <Checkbox
                            key={permission.id}
                            label={
                              <span>
                                <span className="block text-[11.5px] font-semibold text-ink-700">{permission.code}</span>
                                <span className="block text-[9.5px] text-ink-400">{permission.description}</span>
                              </span>
                            }
                            checked={roleForm.permissionCodes.includes(permission.code)}
                            onChange={() => togglePermission(permission.code)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {permissionGroups.length === 0 && <p className="text-[11px] text-ink-400">No permissions available.</p>}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ---------- Tax modal ---------- */}
      <Modal
        open={taxOpen}
        onClose={() => setTaxOpen(false)}
        title={taxEdit ? 'Edit tax category' : 'New tax category'}
        description="GST rates are configuration, not code. Keep HSN and slab aligned with your registrations."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTaxOpen(false)}>Cancel</Button>
            <Button size="sm" loading={taxMutation.isPending} disabled={!taxForm.name.trim()} onClick={() => taxMutation.mutate()}>
              {taxEdit ? 'Save category' : 'Create category'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={taxForm.name} onChange={(event) => setTaxForm({ ...taxForm, name: event.target.value })} placeholder="GST 5%" />
            </Field>
            <Field label="HSN code">
              <Input value={taxForm.hsnCode} onChange={(event) => setTaxForm({ ...taxForm, hsnCode: event.target.value })} placeholder="6204" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="GST %" required>
              <Input type="number" min={0} step="0.01" disabled={taxForm.exempt} value={taxForm.gstRate} onChange={(event) => setTaxForm({ ...taxForm, gstRate: event.target.value })} />
            </Field>
            <Field label="CGST %" required>
              <Input type="number" min={0} step="0.01" disabled={taxForm.exempt} value={taxForm.cgstRate} onChange={(event) => setTaxForm({ ...taxForm, cgstRate: event.target.value })} />
            </Field>
            <Field label="SGST %" required>
              <Input type="number" min={0} step="0.01" disabled={taxForm.exempt} value={taxForm.sgstRate} onChange={(event) => setTaxForm({ ...taxForm, sgstRate: event.target.value })} />
            </Field>
            <Field label="IGST %" required>
              <Input type="number" min={0} step="0.01" disabled={taxForm.exempt} value={taxForm.igstRate} onChange={(event) => setTaxForm({ ...taxForm, igstRate: event.target.value })} />
            </Field>
          </div>
          <div className="space-y-2">
            <Checkbox label="Exempt / nil-rated" checked={taxForm.exempt} onChange={(event) => setTaxForm({ ...taxForm, exempt: event.target.checked })} />
            <Checkbox label="Prices include this tax by default" checked={taxForm.taxInclusive} onChange={(event) => setTaxForm({ ...taxForm, taxInclusive: event.target.checked })} />
            <Checkbox label="Active" checked={taxForm.active} onChange={(event) => setTaxForm({ ...taxForm, active: event.target.checked })} />
          </div>
        </div>
      </Modal>

      {/* ---------- Template modal ---------- */}
      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="Notification template"
        description="Use variables like {{customerName}}, {{invoiceNo}} and {{amount}}; unmatched variables are left in place."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={templateMutation.isPending}
              disabled={!templateForm.subject.trim() || !templateForm.body.trim()}
              onClick={() => templateMutation.mutate()}
            >
              Save template
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Event" required>
              <Select value={templateForm.event} onChange={(event) => setTemplateForm({ ...templateForm, event: event.target.value })}>
                {notificationEvents.map((event) => (
                  <option key={event} value={event}>{titleCase(event)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Channel" required>
              <Select value={templateForm.channel} onChange={(event) => setTemplateForm({ ...templateForm, channel: event.target.value })}>
                {notificationChannels.map((channel) => (
                  <option key={channel} value={channel}>{titleCase(channel)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Subject" required>
            <Input value={templateForm.subject} onChange={(event) => setTemplateForm({ ...templateForm, subject: event.target.value })} placeholder="Your invoice {{invoiceNo}} from {{businessName}}" />
          </Field>
          <Field label="Body" required>
            <Textarea className="min-h-36" value={templateForm.body} onChange={(event) => setTemplateForm({ ...templateForm, body: event.target.value })} placeholder="Thank you {{customerName}}. Invoice {{invoiceNo}} for {{amount}} is confirmed." />
          </Field>
          <Checkbox label="Template is active" checked={templateForm.active} onChange={(event) => setTemplateForm({ ...templateForm, active: event.target.checked })} />
        </div>
      </Modal>

      {/* ---------- Restore modal ---------- */}
      <Modal
        open={restoreBackup != null}
        onClose={() => setRestoreBackup(null)}
        title="Restore database"
        description={restoreBackup ? `${restoreBackup.fileName} · ${fileSize(restoreBackup.sizeBytes)}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRestoreBackup(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="danger"
              loading={restoreMutation.isPending}
              disabled={!restoreConfirmed || !restoreForm.reason.trim() || !restoreForm.approverUsername.trim() || !restoreForm.approverPin.trim()}
              onClick={() => restoreMutation.mutate()}
            >
              <RotateCcw size={13} /> Restore database
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-brick-300/50 bg-brick-100/40 px-3 py-2.5 text-[10.5px] leading-4 text-brick-600">
            This replaces live data. A pre-restore safety backup is created automatically, but any sales made after this
            snapshot will be lost.
          </div>
          <Field label="Type the confirmation phrase" required hint={restorePhrase}>
            <Input value={restoreForm.confirmation} onChange={(event) => setRestoreForm({ ...restoreForm, confirmation: event.target.value })} placeholder={restorePhrase} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Approver username" required>
              <Input value={restoreForm.approverUsername} onChange={(event) => setRestoreForm({ ...restoreForm, approverUsername: event.target.value })} placeholder="owner" />
            </Field>
            <Field label="Approver PIN" required>
              <Input type="password" inputMode="numeric" maxLength={6} value={restoreForm.approverPin} onChange={(event) => setRestoreForm({ ...restoreForm, approverPin: event.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
          <Field label="Reason" required>
            <Textarea value={restoreForm.reason} onChange={(event) => setRestoreForm({ ...restoreForm, reason: event.target.value })} placeholder="Recovering from a failed migration, data corruption…" />
          </Field>
        </div>
      </Modal>

      <p className="mt-4 flex items-center gap-2 text-[10.5px] text-ink-400">
        <ReceiptText size={13} /> Signed in as {user?.fullName} · {user?.roles?.join(', ')} · {formatDate(todayISO())}
      </p>
    </div>
  )
}
