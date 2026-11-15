import { useEffect, useId, useState } from "react";

// File picker with drag and drop and an image preview. Calls onFile(file).
export default function FileDrop({ file, onFile, prompt = "Drop an image here", hint = "PNG, JPG, SVG or WebP. The file stays on your device." }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (files) => files?.[0] && onFile(files[0]);

  return (
    <div
      className={`drop ${dragging ? "drop--over" : ""} ${file ? "drop--filled" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
    >
      <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {file ? (
        <div className="drop__file">
          <div className="drop__preview">{preview && <img src={preview} alt={`Preview of ${file.name}`} />}</div>
          <div>
            <p className="drop__name">{file.name}</p>
            <p className="drop__meta">{(file.size / 1024).toFixed(1)} KB</p>
            <label htmlFor={inputId} className="link-btn">Choose a different file</label>
          </div>
        </div>
      ) : (
        <label htmlFor={inputId} className="drop__empty">
          <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="drop__prompt">{prompt}</span>
          <span className="drop__hint">or <span className="drop__browse">browse your files</span>. {hint}</span>
        </label>
      )}
    </div>
  );
}
