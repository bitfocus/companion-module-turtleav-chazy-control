import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type DeviceType = 'chazy control' | 'chazy control pro'

export type ModuleConfig = {
	model: DeviceType
	host: string
	port: number
	user: string
	interval: number
	imageInterval: number
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
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 80,
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
			description:
				'How often Preview feedbacks refresh their captured image. Only runs while at least one Preview feedback is in use.',
		},
	]
}
