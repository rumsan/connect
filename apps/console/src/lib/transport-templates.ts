import {
  CreditUnitType,
  TransportType,
  ValidationAddress,
  ValidationContent,
  type SetTransportPricing,
} from './types';

/**
 * Provider blueprints for transport setup.
 *
 * Connect stores a free-form `config` blob per transport, which means every new
 * app repeats the same provider-specific JSON. These templates capture the
 * shapes that are known to work (mirrored from `bruno/transport/create`) and
 * expose only the parts that actually differ between apps — credentials, sender
 * ids, endpoints — as typed fields.
 */

export type TemplateField = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean';
  placeholder?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
};

export type TransportTemplate = {
  id: string;
  name: string;
  /** Default transport name; the operator can still rename it. */
  suggestedName: string;
  description: string;
  type: TransportType;
  /** Grouping for the picker. */
  category: 'SMS' | 'WhatsApp' | 'Email' | 'Chat' | 'Voice' | 'Custom';
  validationAddress?: ValidationAddress;
  validationContent?: ValidationContent;
  pricing?: SetTransportPricing;
  fields: TemplateField[];
  /** Turns field values into the `config` blob Connect expects. */
  build: (v: Record<string, string>) => Record<string, unknown>;
};

/** `{%…%}` placeholders are substituted by Connect per recipient. */
const ADDRESS = '{%address%}';
const CONTENT = '{%message.content%}';

export const TRANSPORT_TEMPLATES: TransportTemplate[] = [
  {
    id: 'twilio-whatsapp',
    name: 'Twilio WhatsApp',
    suggestedName: 'WhatsApp (Twilio)',
    description:
      'Template-based WhatsApp messaging through a Twilio Messaging Service.',
    type: TransportType.API,
    category: 'WhatsApp',
    validationAddress: ValidationAddress.PHONE,
    validationContent: ValidationContent.TEXT,
    fields: [
      {
        key: 'url',
        label: 'Twilio messages endpoint',
        type: 'text',
        required: true,
        placeholder:
          'https://api.twilio.com/2010-04-01/Accounts/ACxxxx/Messages.json',
      },
      {
        key: 'messagingServiceSid',
        label: 'Messaging Service SID',
        type: 'text',
        required: true,
        placeholder: 'MGxxxxxxxxxxxxxxxx',
      },
      {
        key: 'authorization',
        label: 'Authorization header',
        type: 'password',
        required: true,
        hint: 'The full header value, e.g. "Basic ABC123…".',
      },
      { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxx' },
      { key: 'apiSecret', label: 'API secret', type: 'password' },
    ],
    build: (v) => ({
      url: v.url,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: v.authorization,
      },
      body: {
        MessagingServiceSid: v.messagingServiceSid,
        To: ADDRESS,
        ContentSid: CONTENT,
        ContentVariables: '{%message.meta.contentVariables%}',
      },
      meta: {
        provider: 'twilio',
        accountSid: v.accountSid,
        apiSecret: v.apiSecret,
        capabilities: ['TEMPLATE_VERIFICATION', 'PHONE_NUMBER_VALIDATION'],
      },
    }),
  },
  {
    id: 'sparrow-sms',
    name: 'Sparrow SMS',
    suggestedName: 'SMS (Sparrow)',
    description: 'Nepali SMS gateway. Billed per segment.',
    type: TransportType.API,
    category: 'SMS',
    validationAddress: ValidationAddress.PHONE,
    validationContent: ValidationContent.TEXT,
    pricing: { creditPerUnit: 1, unitType: CreditUnitType.SEGMENT, currency: 'NPR' },
    fields: [
      {
        key: 'url',
        label: 'API URL',
        type: 'text',
        required: true,
        defaultValue: 'http://api.sparrowsms.com/v2/sms/',
      },
      { key: 'token', label: 'Token', type: 'password', required: true },
      {
        key: 'from',
        label: 'Sender id',
        type: 'text',
        required: true,
        placeholder: 'TheAlert',
      },
    ],
    build: (v) => ({
      url: v.url,
      body: { token: v.token, from: v.from, to: ADDRESS, text: CONTENT },
    }),
  },
  {
    id: 'plasgate-sms',
    name: 'PlasGate SMS',
    suggestedName: 'SMS (PlasGate)',
    description: 'Cambodian SMS gateway with delivery receipts.',
    type: TransportType.API,
    category: 'SMS',
    validationAddress: ValidationAddress.PHONE,
    validationContent: ValidationContent.TEXT,
    fields: [
      {
        key: 'baseUrl',
        label: 'Base URL',
        type: 'text',
        required: true,
        defaultValue: 'https://cloudapi.plasgate.com/rest/send',
      },
      { key: 'privateKey', label: 'Private key', type: 'password', required: true },
      {
        key: 'sender',
        label: 'Sender id',
        type: 'text',
        required: true,
        placeholder: 'PlasGateUAT',
      },
      {
        key: 'dlrUrl',
        label: 'Delivery receipt URL',
        type: 'text',
        hint: 'Connect webhook that receives delivery status callbacks.',
      },
    ],
    build: (v) => ({
      url: `${v.baseUrl}?private_key=${v.privateKey}`,
      body: {
        to: ADDRESS,
        content: CONTENT,
        sender: v.sender,
        dlr: 'yes',
        'dlr-url': v.dlrUrl,
      },
    }),
  },
  {
    id: 'prabhu-sms',
    name: 'Prabhu SMS',
    suggestedName: 'SMS (Prabhu)',
    description: 'Bulk SMS endpoint that takes an array payload.',
    type: TransportType.API,
    category: 'SMS',
    validationAddress: ValidationAddress.PHONE,
    validationContent: ValidationContent.TEXT,
    fields: [
      {
        key: 'baseUrl',
        label: 'Base URL',
        type: 'text',
        required: true,
        defaultValue: 'https://smsml.creationsoftnepal.com/SendBulkV1',
      },
      { key: 'token', label: 'Token', type: 'password', required: true },
    ],
    build: (v) => ({
      url: `${v.baseUrl}?token=${v.token}`,
      body: { bulkData: [{ MobileNumber: ADDRESS, Message: CONTENT }] },
    }),
  },
  {
    id: 'telegram-bot',
    name: 'Telegram bot',
    suggestedName: 'Telegram Bot',
    description: 'Sends via the Telegram Bot API using a chat id as the address.',
    type: TransportType.API,
    category: 'Chat',
    validationAddress: ValidationAddress.ANY,
    validationContent: ValidationContent.TEXT,
    fields: [
      { key: 'botToken', label: 'Bot token', type: 'password', required: true },
      {
        key: 'parseMode',
        label: 'Parse mode',
        type: 'text',
        defaultValue: 'HTML',
        hint: 'HTML or MarkdownV2.',
      },
    ],
    build: (v) => ({
      url: `https://api.telegram.org/bot${v.botToken}/sendMessage`,
      body: { chat_id: ADDRESS, text: CONTENT, parse_mode: v.parseMode || 'HTML' },
      meta: { provider: 'telegram' },
    }),
  },
  {
    id: 'slack-webhook',
    name: 'Slack webhook',
    suggestedName: 'Slack API',
    description: 'Posts messages to a Slack incoming webhook.',
    type: TransportType.API,
    category: 'Chat',
    validationContent: ValidationContent.TEXT,
    fields: [
      {
        key: 'url',
        label: 'Webhook URL',
        type: 'text',
        required: true,
        placeholder: 'https://hooks.slack.com/services/…',
      },
    ],
    build: (v) => ({ url: v.url, body: { message: CONTENT, email: ADDRESS } }),
  },
  {
    id: 'smtp',
    name: 'SMTP email',
    suggestedName: 'Email',
    description: 'Any SMTP server — Gmail, SES SMTP, self-hosted.',
    type: TransportType.SMTP,
    category: 'Email',
    validationAddress: ValidationAddress.EMAIL,
    validationContent: ValidationContent.TEXT,
    fields: [
      {
        key: 'host',
        label: 'Host',
        type: 'text',
        required: true,
        defaultValue: 'smtp.gmail.com',
      },
      { key: 'port', label: 'Port', type: 'number', required: true, defaultValue: 587 },
      {
        key: 'secure',
        label: 'Use TLS (port 465)',
        type: 'boolean',
        defaultValue: false,
      },
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
      {
        key: 'defaultFrom',
        label: 'Default from',
        type: 'text',
        hint: 'Falls back to the username when blank.',
      },
      { key: 'defaultSubject', label: 'Default subject', type: 'text' },
    ],
    build: (v) => ({
      host: v.host,
      port: Number(v.port) || 587,
      secure: v.secure === 'true',
      username: v.username,
      password: v.password,
      defaultFrom: v.defaultFrom || v.username,
      defaultSubject: v.defaultSubject,
    }),
  },
  {
    id: 'ses',
    name: 'Amazon SES',
    suggestedName: 'Email (SES)',
    description: 'Amazon Simple Email Service via API credentials.',
    type: TransportType.SES,
    category: 'Email',
    validationAddress: ValidationAddress.EMAIL,
    validationContent: ValidationContent.TEXT,
    fields: [
      {
        key: 'region',
        label: 'Region',
        type: 'text',
        required: true,
        defaultValue: 'us-east-1',
      },
      { key: 'accessKeyId', label: 'Access key id', type: 'text', required: true },
      {
        key: 'secretAccessKey',
        label: 'Secret access key',
        type: 'password',
        required: true,
      },
      { key: 'defaultFrom', label: 'Default from', type: 'text' },
    ],
    build: (v) => ({
      region: v.region,
      accessKeyId: v.accessKeyId,
      secretAccessKey: v.secretAccessKey,
      defaultFrom: v.defaultFrom,
    }),
  },
  {
    id: 'voice',
    name: 'Voice (Asterisk)',
    suggestedName: 'Voice',
    description: 'Outbound calls through the Asterisk worker. Billed per minute.',
    type: TransportType.VOICE,
    category: 'Voice',
    validationAddress: ValidationAddress.PHONE,
    validationContent: ValidationContent.URL,
    pricing: { creditPerUnit: 1, unitType: CreditUnitType.MINUTE, currency: 'NPR' },
    fields: [],
    build: () => ({}),
  },
  {
    id: 'echo',
    name: 'Echo (testing)',
    suggestedName: 'Echo Broadcast',
    description: 'Delivers nowhere real — use it to exercise a flow safely.',
    type: TransportType.ECHO,
    category: 'Custom',
    fields: [
      { key: 'slack_url', label: 'Slack URL', type: 'text' },
      { key: 'slack_email', label: 'Slack email', type: 'text' },
    ],
    build: (v) => ({ slack_url: v.slack_url, slack_email: v.slack_email }),
  },
  {
    id: 'custom-api',
    name: 'Custom REST API',
    suggestedName: 'Custom API',
    description: 'Any HTTP endpoint. Edit the JSON directly on the next step.',
    type: TransportType.API,
    category: 'Custom',
    fields: [
      {
        key: 'url',
        label: 'Endpoint URL',
        type: 'text',
        required: true,
        placeholder: 'https://api.example.com/send',
      },
      { key: 'method', label: 'Method', type: 'text', defaultValue: 'POST' },
    ],
    build: (v) => ({
      url: v.url,
      method: v.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { to: ADDRESS, message: CONTENT },
    }),
  },
];

export function templateById(id: string) {
  return TRANSPORT_TEMPLATES.find((t) => t.id === id);
}

/** Seeds the field values from each template's declared defaults. */
export function initialValues(template: TransportTemplate) {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    values[field.key] =
      field.defaultValue === undefined ? '' : String(field.defaultValue);
  }
  return values;
}
