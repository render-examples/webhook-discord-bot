interface WebhookData {
    id: string
    serviceId: string
}

export interface WebhookPayload {
    type: string
    timestamp: Date
    data: WebhookData
}

export interface RenderService {
    id: string
    name: string
    dashboardUrl: string
}

export interface RenderEvent {
    id: string
    type: string
    details: any
}
