import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, PrimaryButton, SecondaryButton } from '../components/ui.jsx'
import { FormField, TextInput, SelectInput } from '../components/form.jsx'
import { regions, clientTiers, team } from '../data/atelier.js'
import { buildClient } from '../store/records.js'
import { useAppStore } from '../store/AppStore.jsx'
import { ownerForRegion } from '../data/ownership.js'

const TIER_OPTIONS = Object.entries(clientTiers).map(([value, t]) => ({ value, label: t.label }))
const TYPE_OPTIONS = ['Trade', 'Retail']

const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }
const sectionLabel = { fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, margin: '30px 0 16px' }

export default function ClientNew() {
  const navigate = useNavigate()
  const { clients, addClient, setClientOwner } = useAppStore()
  const [form, setForm] = useState({
    name: '', city: '', region: regions[0], type: 'Trade', tier: '1',
    owner: '', // empty ⇒ follow the region matrix until the user picks one (decision 4)
    contact: { name: '', email: '', phone: '' },
  })
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setContact = (k, v) => setForm((f) => ({ ...f, contact: { ...f.contact, [k]: v } }))

  // The owner shown: an explicit pick, else the region matrix default.
  const matrixOwner = ownerForRegion(form.region)
  const effectiveOwner = form.owner || matrixOwner

  const submit = () => {
    const rec = buildClient(form, clients.map((c) => c.id))
    if (rec.error) {
      setError(rec.error)
      return
    }
    addClient(rec)
    // Only record an override (with audit) when the chosen owner differs from the matrix default.
    if (effectiveOwner !== ownerForRegion(rec.region)) setClientOwner(rec.id, effectiveOwner)
    navigate(`/clients/${rec.id}`)
  }

  return (
    <>
      <PageHeader
        eyebrow="Trade Accounts"
        title="New client"
        right={<SecondaryButton onClick={() => navigate('/clients')} style={{ whiteSpace: 'nowrap' }}>Cancel</SecondaryButton>}
      />

      <div style={{ maxWidth: 620, marginTop: 30, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '28px 30px 30px' }}>
        <FormField label="Client name" error={error || undefined}>
          <TextInput
            value={form.name}
            onChange={(v) => { set('name', v); if (error) setError('') }}
            placeholder="e.g. Robert Andrews Interiors"
            ariaLabel="Client name"
            invalid={!!error}
          />
        </FormField>

        <div style={twoCol}>
          <FormField label="City">
            <TextInput value={form.city} onChange={(v) => set('city', v)} placeholder="e.g. Nelson" ariaLabel="City" />
          </FormField>
          <FormField label="Region">
            <SelectInput value={form.region} onChange={(v) => set('region', v)} options={regions} ariaLabel="Region" />
          </FormField>
        </div>

        <div style={twoCol}>
          <FormField label="Type">
            <SelectInput value={form.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} ariaLabel="Account type" />
          </FormField>
          <FormField label="Discount tier" hint="Tier 1 −10% / Tier 2 −5% on qualifying orders">
            <SelectInput value={form.tier} onChange={(v) => set('tier', v)} options={TIER_OPTIONS} ariaLabel="Discount tier" />
          </FormField>
        </div>

        <div style={twoCol}>
          <FormField label="Account owner" hint={form.owner ? 'Manual override' : `Defaults from region (${matrixOwner})`}>
            <SelectInput value={effectiveOwner} onChange={(v) => set('owner', v)} options={team} ariaLabel="Account owner" />
          </FormField>
        </div>

        <div style={sectionLabel}>Primary contact</div>
        <FormField label="Contact name">
          <TextInput value={form.contact.name} onChange={(v) => setContact('name', v)} placeholder="e.g. Olivia Marlow" ariaLabel="Contact name" />
        </FormField>
        <div style={twoCol}>
          <FormField label="Email">
            <TextInput value={form.contact.email} onChange={(v) => setContact('email', v)} type="email" placeholder="name@studio.co.nz" ariaLabel="Contact email" />
          </FormField>
          <FormField label="Phone">
            <TextInput value={form.contact.phone} onChange={(v) => setContact('phone', v)} placeholder="+64 21 000 0000" ariaLabel="Contact phone" />
          </FormField>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
          <PrimaryButton onClick={submit}>Create client</PrimaryButton>
          <SecondaryButton onClick={() => navigate('/clients')}>Cancel</SecondaryButton>
        </div>
      </div>
    </>
  )
}
