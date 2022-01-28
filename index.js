#!/usr/bin/env node

require('./src/helpers');
const toggl = require('./src/toggl');
const tempo = require('./src/tempo');
const { init: configInit } = require('./src/config');

const process = async() => {
	const config = await configInit();
	if(!config)
		return;

	const timesSheets = await toggl.getReport(config);
	return tempo.sendTimesSheets(timesSheets, config);
};

if(require.main === module)
	process();

module.exports = { process };