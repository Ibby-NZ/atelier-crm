// App-wide store: localStorage-backed React context holding ONLY user-created records. Seed records
// (the canonical SO/PO/clients from ../data/atelier.js) are merged in at read time so the demo always
// shows them without ever persisting them. All mutations are immutable (setState(prev => …) + spreads).
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { loadState, saveState } from './storage.js'
import { seedClients } from './records.js'
import { seedUsers } from '../auth/userRecords.js'
import { salesOrder, purchaseOrder, clientAccount } from '../data/atelier.js'
import { supplierByName } from '../data/suppliers.js'

const AppStoreContext = createContext(null)

export function AppStoreProvider({ children }) {
  const [state, setState] = useState(loadState)

  // Persist created records whenever they change. saveState swallows quota/privacy errors (degrades
  // to in-memory) so a failed write never breaks the UI.
  useEffect(() => {
    saveState(state)
  }, [state])

  // ---- immutable actions ----------------------------------------------------
  const addClient = useCallback((client) => {
    setState((prev) => ({ ...prev, clients: [...prev.clients, client] }))
  }, [])
  const addSalesOrder = useCallback((order) => {
    setState((prev) => ({ ...prev, salesOrders: [...prev.salesOrders, order] }))
  }, [])
  const addPurchaseOrder = useCallback((po) => {
    setState((prev) => ({ ...prev, purchaseOrders: [...prev.purchaseOrders, po] }))
  }, [])
  // Client ownership override + audit trail (decision 4, 15 Jul). Persists in one place (keyed by
  // client id) so it works for seeded clients too — they are never in `state.clients`.
  const setClientOwner = useCallback((id, owner, by = 'Liz') => {
    setState((prev) => {
      const cur = prev.clientOwnership[id]
      if (cur && cur.owner === owner) return prev // no-op — don't log a non-change
      const entry = { at: new Date().toISOString(), from: (cur && cur.owner) || null, to: owner, by }
      return {
        ...prev,
        clientOwnership: { ...prev.clientOwnership, [id]: { owner, audit: [...((cur && cur.audit) || []), entry] } },
      }
    })
  }, [])
  // Update actions touch only created records: seeds are never in `state`, and the extra !seeded
  // guard makes it impossible to shadow-fork a seed into storage if one ever leaks in.
  const updateSalesOrder = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      salesOrders: prev.salesOrders.map((o) => (!o.seeded && (o.id === id || o.number === id) ? { ...o, ...patch } : o)),
    }))
  }, [])
  const updatePurchaseOrder = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      purchaseOrders: prev.purchaseOrders.map((p) => (!p.seeded && (p.id === id || p.number === id) ? { ...p, ...patch } : p)),
    }))
  }, [])

  // ---- user roster (ADMIN_USERS only — gated at the screen, GEN-01) ----------
  // Only created users are persisted/mutated; the seeded cast is merged at read time and is
  // immutable, so these actions can never remove or re-role a seed (and thus never the last admin).
  const addUser = useCallback((user) => {
    setState((prev) => ({ ...prev, users: [...prev.users, user] }))
  }, [])
  const removeUser = useCallback((id) => {
    setState((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) }))
  }, [])
  const updateUser = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }))
  }, [])

  // ---- merged selectors (seed record first, then created) -------------------
  const salesOrders = useMemo(
    () => [{ ...salesOrder, id: salesOrder.number, seeded: true, status: 'Draft' }, ...state.salesOrders],
    [state.salesOrders],
  )
  const purchaseOrders = useMemo(
    () => [
      // country enriches the seed (the seed object has none) so the PO detail panel reads it uniformly.
      { ...purchaseOrder, id: purchaseOrder.number, seeded: true, country: supplierByName(purchaseOrder.supplier)?.country || '' },
      ...state.purchaseOrders,
    ],
    [state.purchaseOrders],
  )
  const clients = useMemo(() => [...seedClients(), ...state.clients], [state.clients])
  // Seed cast first, then admin-created — the live roster auth signs in against.
  const users = useMemo(() => [...seedUsers(), ...state.users], [state.users])

  // ---- getters (null when missing) ------------------------------------------
  const getSalesOrder = useCallback((id) => salesOrders.find((o) => o.id === id) || null, [salesOrders])
  const getPurchaseOrder = useCallback((id) => purchaseOrders.find((p) => p.id === id) || null, [purchaseOrders])
  const getClient = useCallback(
    (id) => {
      const cl = clients.find((c) => c.id === id)
      if (!cl) return null
      // The one rich seed account (Marlow & Finch 360) carries its full CRM detail.
      if (cl.id === 'marlow-finch-interiors') return { ...cl, account: clientAccount }
      return cl
    },
    [clients],
  )

  const clientOwnership = state.clientOwnership

  const value = useMemo(
    () => ({
      salesOrders,
      purchaseOrders,
      clients,
      users,
      clientOwnership,
      addClient,
      addSalesOrder,
      addPurchaseOrder,
      setClientOwner,
      updateSalesOrder,
      updatePurchaseOrder,
      addUser,
      removeUser,
      updateUser,
      getSalesOrder,
      getPurchaseOrder,
      getClient,
    }),
    [salesOrders, purchaseOrders, clients, users, clientOwnership, addClient, addSalesOrder, addPurchaseOrder, setClientOwner, updateSalesOrder, updatePurchaseOrder, addUser, removeUser, updateUser, getSalesOrder, getPurchaseOrder, getClient],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore must be used within an <AppStoreProvider>. Wrap the app in main.jsx.')
  return ctx
}
