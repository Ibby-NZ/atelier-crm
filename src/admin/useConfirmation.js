import { useCallback, useEffect, useRef, useState } from 'react'
import { createConfirmation } from './confirmation.js'

// Await a staff decision, then run the screen's existing mutation/reload cycle.
// Delete refusals still belong exclusively to useCrudScreen's delete kit.
export function useConfirmation() {
  const [request, setRequest] = useState(null)
  const controller = useRef(null)
  if (!controller.current) controller.current = createConfirmation(setRequest)
  const onConfirm = useCallback(() => controller.current.settle(true), [])
  const onCancel = useCallback(() => controller.current.settle(false), [])
  useEffect(() => () => controller.current.dispose(), [])
  return {
    ask: controller.current.ask,
    dialog: {
      confirmTone: 'ink',
      ...request,
      open: request !== null,
      onConfirm,
      onCancel,
    },
  }
}
