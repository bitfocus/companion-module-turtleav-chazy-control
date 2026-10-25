import { Regex, type DropdownChoice, type SomeCompanionConfigField } from '@companion-module/base'

export type DeviceType = 'chazy control' | 'chazy control pro'

/** The sets of variables the module can keep, each chosen in the config */
export const ConnectionVariables = ['encoders', 'decoders', 'danteDevices', 'danteSubscriptions'] as const
export type ConnectionVariable = (typeof ConnectionVariables)[number]

const CONNECTION_VARIABLE_CHOICES = [
	{ id: 'encoders', label: 'Encoders' },
	{ id: 'decoders', label: 'Decoders' },
	{ id: 'danteDevices', label: 'Dante Devices' },
	{ id: 'danteSubscriptions', label: 'Dante Subscriptions' },
] as const satisfies DropdownChoice<ConnectionVariable>[]

export type ModuleConfig = {
	model: DeviceType
	host: string
	protocol: 'http' | 'https'
	allowInsecure: boolean
	user: string
	interval: number
	imageInterval: number
	/** The sets of variables to keep for the devices the controller reports */
	connectionVariables: ConnectionVariable[]
}

/**
 * The variable sets chosen in the config. A config saved before the field existed has none, and one saved by a later
 * version may name sets this one doesn't know, which are left out.
 */
export function connectionVariablesOf(config: Partial<ModuleConfig>): ReadonlySet<ConnectionVariable> {
	const chosen: unknown = config.connectionVariables
	if (!Array.isArray(chosen)) return new Set()
	return new Set(ConnectionVariables.filter((set) => chosen.includes(set)))
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'dropdown',
			id: 'model',
			label: 'Model',
			default: 'chazy control',
			choices: [
				{ id: 'chazy control', label: 'Chazy Control' },
				{ id: 'chazy control pro', label: 'Chazy Control Pro' },
			],
			width: 4,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Hostname',
			width: 8,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'dropdown',
			id: 'protocol',
			label: 'Protocol',
			default: 'http',
			choices: [
				{ id: 'http', label: 'HTTP' },
				{ id: 'https', label: 'HTTPS' },
			],
			width: 4,
			disableAutoExpression: true,
		},
		{
			type: 'checkbox',
			id: 'allowInsecure',
			label: 'Allow Insecure Connections',
			default: false,
			width: 4,
			description: 'Accept self-signed or otherwise untrusted TLS certificates when using HTTPS.',
			isVisibleExpression: '$(options:protocol) == "https"',
		},
		{
			type: 'textinput',
			id: 'user',
			label: 'Username',
			default: 'admin',
			description: 'Must be admin level',
			width: 4,
		},
		{
			type: 'number',
			id: 'interval',
			label: 'Poll Interval (ms)',
			default: 5000,
			min: 200,
			max: 60000,
			width: 4,
		},
		{
			type: 'number',
			id: 'imageInterval',
			label: 'Image Poll Interval (ms)',
			default: 10000,
			min: 200,
			max: 60000,
			width: 4,
			description: 'How often Preview feedbacks refresh their captured image.',
		},
		{
			type: 'multidropdown',
			id: 'connectionVariables',
			label: 'Connection Variables',
			choices: [...CONNECTION_VARIABLE_CHOICES],
			default: [],
			sortSelection: true,
			width: 8,
			description:
				'A variable per encoder, decoder or Dante device the controller reports, holding its full status. ' +
				'Dante Subscriptions adds one per receive channel instead, naming its source and status.',
		},
	]
}
