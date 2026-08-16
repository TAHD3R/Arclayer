# Use one Communications delivery authority

User feedback replies, operator-authored Campaigns, transactional notices, message templates, and email-service operations belong to one Communications Platform Domain whose default product surface is the User feedback queue. Their source aggregates remain distinct but share one durable per-recipient/channel delivery authority, so retries cannot duplicate messages or mutate the originating business event; Plugin lifecycle belongs to Extensibility and historical engagement analysis belongs to Observability.
