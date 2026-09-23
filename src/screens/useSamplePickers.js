// The samples section's two <select> sources — showrooms and suppliers. The
// register and the sample-orders list (their showroom filters), a sample's and
// a sample order's own pages, and the two create pages all read them, so the
// read lives here once rather than in six effects that could drift on a limit
// or on how a failed picker behaves.
//
// Read once per mount — a showroom or supplier added mid-session is picked up
// on the next visit, which is the same lifetime every other picker in this repo
// has.

import { useEffect, useState } from 'react'
import { safeFetch } from '../lib/api.js'
import { SHOWROOMS_PATH } from './adminShowrooms.js'

// Both pickers are small tables read whole; neither endpoint is paged by a
// screen that only needs a <select>.
const PICKER_LIMIT = 200

export function useSamplePickers() {
  const [showrooms, setShowrooms] = useState([])
  const [suppliers, setSuppliers] = useState([])

  useEffect(() => {
    let active = true
    // safeFetch never throws: a picker that failed to load leaves an empty
    // <select>, which must not take the whole screen down with it.
    safeFetch(`${SHOWROOMS_PATH}?limit=${PICKER_LIMIT}`).then(({ data }) => {
      if (active && data?.showrooms) setShowrooms(data.showrooms)
    })
    safeFetch(`/admin/suppliers?limit=${PICKER_LIMIT}`).then(({ data }) => {
      if (active && data?.suppliers) setSuppliers(data.suppliers)
    })
    return () => {
      active = false
    }
  }, [])

  return { showrooms, suppliers }
}
