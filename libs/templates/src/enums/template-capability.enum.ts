export enum TemplateCapability {
  TEMPLATE_VERIFICATION = 'TEMPLATE_VERIFICATION',
  MEDIA_SUPPORT = 'MEDIA_SUPPORT',
  MULTI_LANGUAGE = 'MULTI_LANGUAGE',
  PARAMETER_VALIDATION = 'PARAMETER_VALIDATION',
}

export interface TransportCapabilities {
  capabilities?: TemplateCapability[];
}
