const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export const sendChatMessage = async ({ tenantId, query, topK = 3 }) => {
	const response = await fetch(`${API_BASE_URL}/chat`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-tenant-id': tenantId,
		},
		body: JSON.stringify({ tenant_id: tenantId, query, top_k: topK }),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.detail || 'Failed to send chat message')
	}

	return response.json()
}

export const uploadDocument = async ({ tenantId, file }) => {
	const formData = new FormData()
	formData.append('file', file)
	formData.append('tenant_id', tenantId)

	const response = await fetch(`${API_BASE_URL}/upload`, {
		method: 'POST',
		headers: {
			'x-tenant-id': tenantId,
		},
		body: formData,
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.detail || 'Failed to upload document')
	}

	return response.json()
}

export const deleteDocument = async ({ tenantId, documentId }) => {
	const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
		method: 'DELETE',
		headers: {
			'x-tenant-id': tenantId,
		},
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.detail || 'Failed to delete document')
	}

	return response.json()
}
