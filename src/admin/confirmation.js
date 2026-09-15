// Native-dialog replacement decisions, independent of React and the DOM.
// Only one question can own a pending action. Closing or unmounting never writes.
export function createConfirmation(publish) {
  let pending = null
  return {
    ask(options) {
      if (pending) return Promise.resolve(false)
      return new Promise(resolve => {
        pending = resolve
        publish(options)
      })
    },
    settle(accepted) {
      const resolve = pending
      pending = null
      publish(null)
      resolve?.(accepted === true)
    },
    dispose() {
      const resolve = pending
      pending = null
      resolve?.(false)
    },
  }
}

// Ordinary Tab order is native; intervene only at the modal's boundaries.
export function tabTargetIndex(count, current, backwards) {
  if (!count) return null
  if (current < 0) return backwards ? count - 1 : 0
  if (backwards && current === 0) return count - 1
  if (!backwards && current === count - 1) return 0
  return null
}
