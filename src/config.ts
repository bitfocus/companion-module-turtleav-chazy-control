import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type DeviceType = 'chazy control' | 'chazy control pro'

export type ModuleConfig = {
	model: DeviceType
	host: string
	protocol: 'http' | 'https'
	allowInsecure: boolean
	user: string
	interval: number
	imageInterval: number
	variables: boolean
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
			type: 'checkbox',
			id: 'variables',
			label: 'Create Module Variables',
			default: false,
			width: 4,
		},
	]
}
