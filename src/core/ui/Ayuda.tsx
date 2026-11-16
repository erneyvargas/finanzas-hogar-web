import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useTransitionStyles,
  type Placement,
} from '@floating-ui/react'
import { cloneElement, useId, useState, type ReactElement, type Ref } from 'react'

type Disparador = ReactElement<
  Record<string, unknown> & { ref?: Ref<Element>; 'aria-label'?: string; 'aria-describedby'?: string }
>

/**
 * The app's one tooltip. It wraps a single element (an HTML control or an
 * SVG piece) and shows `texto` next to it after a short hover with a mouse
 * or on keyboard focus; leaving, blurring or Escape hide it. Touch taps
 * never open it, so they keep acting on the element.
 *
 * While open, the trigger is described by the tooltip, unless the trigger
 * is already named by that very text (then it would be read twice).
 * An empty `texto` leaves the trigger untouched.
 */
export function Ayuda({
  texto,
  lado = 'top',
  children,
}: {
  texto: string | null | undefined
  lado?: Placement
  children: Disparador
}) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  const activa = Boolean(texto)
  const { refs, floatingStyles, context } = useFloating({
    open: abierta && activa,
    onOpenChange: setAbierta,
    placement: lado,
    // top/left, so the transition's own transform does not undo the position.
    transform: false,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const hover = useHover(context, { enabled: activa, mouseOnly: true, move: false, delay: { open: 150, close: 0 } })
  const foco = useFocus(context, { enabled: activa })
  const descarte = useDismiss(context, { enabled: activa })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, foco, descarte])
  const { isMounted, styles } = useTransitionStyles(context, {
    duration: { open: 120, close: 80 },
    initial: { opacity: 0, transform: 'translateY(2px)' },
  })
  const ref = useMergeRefs([refs.setReference, children.props.ref])

  if (!activa) return children

  const describe = context.open && children.props['aria-label'] !== texto
  return (
    <>
      {cloneElement(
        children,
        getReferenceProps({
          ...children.props,
          ref,
          'aria-describedby': describe ? id : children.props['aria-describedby'],
        }),
      )}
      {isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            id={id}
            role="tooltip"
            className="ayuda"
            style={{ ...floatingStyles, ...styles }}
            {...getFloatingProps()}
          >
            {texto}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
