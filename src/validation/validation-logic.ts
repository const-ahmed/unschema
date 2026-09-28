import { defaultValidationLogic } from '@tanstack/react-form'
import type { ValidationLogicFn } from '@tanstack/react-form'

/**
 * By default, TanStack Form re-runs every live check on submit, with no delay.
 * That would call Jev once per field on top of the final check. So on submit
 * this runs only the empty-field checks and the single final check. Everything
 * else uses TanStack Form's default behaviour.
 */
export const liveChecksThenFinalCheck: ValidationLogicFn = (props) => {
  if (props.event.type !== 'submit') {
    return defaultValidationLogic(props)
  }
  return props.runValidation({
    validators: [
      {
        fn: props.event.async
          ? props.validators?.onSubmitAsync
          : props.validators?.onSubmit,
        cause: 'submit',
      },
    ],
    form: props.form,
  })
}
