import { useEffect, useRef, useState } from 'react'
import { api, KnowledgeFile } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { formatDate, formatFileSize } from '@/lib/utils'

export default function KnowledgeBase() {
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getKnowledgeFiles().then(setFiles)
  }, [])

  async function handleUpload(file: File) {
    setUploading(true)
    setError('')
    try {
      await api.uploadKnowledgeFile(file)
      const fresh = await api.getKnowledgeFiles()
      setFiles(fresh)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload амжилтгүй')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Файлыг устгах уу?')) return
    await api.deleteKnowledgeFile(id)
    setFiles((f) => f.filter((x) => x.id !== id))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-800 p-6 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.3),transparent_60%)]" />
        <div className="relative">
          <p className="text-indigo-300 text-[11px] font-semibold uppercase tracking-widest mb-1">📚 Knowledge Base</p>
          <h1 className="text-xl font-semibold">Мэдлэгийн сан</h1>
          <p className="text-sm text-indigo-200 mt-1">
            PDF, DOCX, TXT файл оруулна уу. AI хариулт үүсгэхэд эдгээр документаас мэдээлэл авна.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-zinc-300 hover:border-zinc-400'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
        />
        <p className="text-2xl mb-2">📂</p>
        <p className="text-sm font-medium text-zinc-700">
          {uploading ? 'Оруулж байна...' : 'Файл чирж оруулах эсвэл дарж сонгоно уу'}
        </p>
        <p className="text-xs text-zinc-400 mt-1">PDF, DOCX, TXT — хамгийн их 50MB</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* File list */}
      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-zinc-900">{f.fileName}</p>
                <p className="text-xs text-zinc-400">
                  {formatFileSize(f.fileSize)} · {formatDate(f.uploadedAt)}
                </p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(f.id)}>
                Устгах
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-400 text-center py-4">Файл байхгүй байна</p>
      )}
    </div>
  )
}
