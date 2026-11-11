import { useCallback } from 'react'
import { useAuth } from '../lib/auth'
import type { BranchInfo } from '../lib/types'
import { usePrint, type PrintContextValue } from './PrintProvider'
import { buildReceiptModel, type ReceiptBuildInput } from './receiptModel'
import type { ReceiptModel } from './types'

export interface ReceiptPrint extends PrintContextValue {
  branch: BranchInfo | null
  /** Builds the receipt with the signed-in business, branch and cashier. */
  buildModel: (
    input: Omit<ReceiptBuildInput, 'business' | 'branch' | 'user' | 'prefs'>,
    options?: { duplicate?: boolean; cancelled?: boolean }
  ) => ReceiptModel | null
}

/**
 * Binds the shared print provider to the signed-in shop. Billing and invoice
 * detail both use this so a reprint and an auto-print share one template.
 */
export function useReceiptPrint(): ReceiptPrint {
  const { business, branchId, branches, user } = useAuth()
  const print = usePrint()
  const branch = branches.find((entry) => entry.id === branchId) ?? null

  const buildModel = useCallback<ReceiptPrint['buildModel']>(
    (input, options) =>
      buildReceiptModel(
        { ...input, business, branch, user, prefs: print.prefs },
        options
      ),
    [business, branch, user, print.prefs]
  )

  return { ...print, branch, buildModel }
}
