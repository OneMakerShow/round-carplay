import { useCallback, useRef } from 'react'
import { TouchAction } from '../../../main/carplay/messages/sendable'

export const useCarplayTouch =
(): React.PointerEventHandler<HTMLDivElement> => {
  const pressedRef = useRef(false);

  return useCallback((e) => {
    let action: TouchAction;
    switch (e.type) {
      case 'pointerdown':
        pressedRef.current = true;
        action = TouchAction.Down;
        break;
      case 'pointermove':
        if (!pressedRef.current) return;
        action = TouchAction.Move;
        break;
      case 'pointerup':
      case 'pointercancel':
      case 'pointerout':
        if (!pressedRef.current) return;
        pressedRef.current = false;
        action = TouchAction.Up;
        break;
      default:
        return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;

    window.carplay.ipc.sendTouch(x, y, action);
  }, []);
};
