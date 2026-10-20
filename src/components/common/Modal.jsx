import { useEffect, useRef } from 'react';

// Built on <dialog>, which gives focus trapping and Escape-to-close for free.
export default function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal__inner">
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
