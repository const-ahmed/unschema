import { defaultValidationLogic } from '@tanstack/react-form'
import type { ValidationLogicFn } from '@tanstack/react-form'

/** On submit, run only the empty-field checks and the final check, not every live check again. */
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
