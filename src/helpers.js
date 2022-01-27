const yargs = require('yargs/yargs')
const {	hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
	.option('reset', {
		alias: 'r',
		type: 'boolean',
		description: 'Reset account information'
	})
	.option('custom', {
		alias: 'c',
		type: 'boolean',
		description: 'Use a custom date range'
	})
	.parse()
