// Local backend URLs for payment and notifications
export const FUNCTIONS = {
  paymentCreate: 'http://localhost:5000/api/payment/create',
  midtransWebhook: 'http://localhost:5000/api/payment/webhook',
  expireOrders: 'http://localhost:5000/api/orders/expire',
  notifyEOApproved: 'http://localhost:5000/api/eo-profiles/notify-approved',
} as const
