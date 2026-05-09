export const AI_SYSTEM_PROMPT_JSON_BODY = 'Responde breve y en formato JSON válido cuando sea posible.'

export const AI_PROMPT_PLACEHOLDER_BODY = 'Pide un body JSON...'
export const AI_SYSTEM_PROMPT_STRICT_JSON =
  'Debes responder solo con JSON valido. Sin markdown, sin texto extra. La salida debe ser parseable por JSON.parse.'

export const AI_DIRECT_RAW_PROMPT =
  'Transforma el JSON actual del body request a una versión mejor estructurada y válida, usando el contexto de URL y método HTTP. Conserva la intención original y devuelve únicamente JSON válido. reemplaza los datos ejemplo tipo "string" por uno validos, como números o booleanos, según corresponda. No incluyas texto adicional ni markdown, solo el JSON mejorado.'
