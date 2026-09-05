import { useState } from 'react'
import { useCategories } from './useCategories'

export interface CategoryManagerProps {
  onClose: () => void
}

function CategoryManager({ onClose }: CategoryManagerProps): React.JSX.Element {
  const { categories, loading, error, createCategory, deleteCategory } = useCategories()
  const [newName, setNewName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (newName.trim().length === 0) {
      return
    }
    try {
      await createCategory(newName.trim())
      setNewName('')
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteCategory(id)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
            {categories.map((category) => (
              <li key={category.id}>
                <span>{category.name}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDelete(category.id)}
                >
                  {`Delete ${category.name}`}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="category-manager-add-form">
          <label htmlFor="new-category-name">New category name</label>
          <input
            id="new-category-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default CategoryManager
