-- Time-based reconciliation requested for interrupted calls, not an AI processing queue.
SELECT cron.schedule('ai-credit-stale-refund', '*/5 * * * *', 'SELECT public.ai_credit_refund_stale();');