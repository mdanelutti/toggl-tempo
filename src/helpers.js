const yargs = require('yargs/yargs')
const {	hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
	.option('configure', {
		alias: 'c',
		type: 'boolean',
		description: 'Update configuration'
	})
	.option('range', {
		alias: 'r',
		type: 'boolean',
		description: 'Use a custom date range'
	})
	.parse()
