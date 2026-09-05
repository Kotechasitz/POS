import { useEffect, useState } from 'react'
import type { CategoryRecord } from '../../../../shared/category'

export interface CategoryManagerProps {
  categories: CategoryRecord[]
  loading: boolean
  error: string | null
  onCreate: (name: string) => Promise<CategoryRecord>
  onUpdate: (id: string, name: string) => Promise<CategoryRecord>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

function CategoryManager({
  categories,
  loading,
  error,
  onCreate,
  onUpdate,
  onDelete,
  onClose
}: CategoryManagerProps): React.JSX.Element {
  const [newName, setNewName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Same Escape-to-close convention as ProductForm's dialog, guarded against
  // an in-flight add/rename/delete so an accidental keypress can't abandon
  // a request that's already been sent.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onClose()
    }
  }

  async function handleAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (newName.trim().length === 0) {
      return
    }
    setSubmitting(true)
    try {
      await onCreate(newName.trim())
      setNewName('')
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing(category: CategoryRecord): void {
    setEditingId(category.id)
    setEditingName(category.name)
    setActionError(null)
  }

  function cancelEditing(): void {
    setEditingId(null)
    setEditingName('')
  }

  async function handleSaveRename(id: string): Promise<void> {
    if (editingName.trim().length === 0) {
      return
    }
    setSubmitting(true)
    try {
      await onUpdate(id, editingName.trim())
      setEditingId(null)
      setEditingName('')
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setSubmitting(true)
    try {
      await onDelete(id)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
      >
        <h2 id="category-manager-title">Manage Categories</h2>

        {loading && <div className="loading-row">Loading categories…</div>}
        {(error || actionError) && (
          <p role="alert" className="alert alert-danger">
            {error ?? actionError}
          </p>
        )}

        {!loading && (
          <ul className="category-manager-list">
            {categories.map((category) =>
              editingId === category.id ? (
                <li key={category.id}>
                  <input
                    aria-label={`Rename ${category.name}`}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    disabled={submitting}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleSaveRename(category.id)}
                    disabled={submitting}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={cancelEditing}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                </li>
              ) : (
                <li key={category.id}>
                  <span>{category.name}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => startEditing(category)}
                    disabled={submitting}
                  >
                    {`Rename ${category.name}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDelete(category.id)}
                    disabled={submitting}
                  >
                    {`Delete ${category.name}`}
                  </button>
                </li>
              )
            )}
          </ul>
        )}

        <form onSubmit={handleAdd} className="category-manager-add-form">
          <label htmlFor="new-category-name">New category name</label>
          <input
            id="new-category-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={submitting}
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            Add
          </button>
        </form>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default CategoryManager
