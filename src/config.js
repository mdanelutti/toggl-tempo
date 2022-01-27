const inquirer = require('inquirer');
const Preferences = require("preferences");
const open = require('open');
const moment = require('moment');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

inquirer.registerPrompt("date", require("inquirer-date-prompt"));

const { argv } = yargs(hideBin(process.argv))

const toggl = require('./toggl');

const defaultFrom = /([0-9+]+)([a-z])/i

const prefsInit = {
	atlassian: {
		domain: 'fizzmod'
	},
	tempo: {},
	toggl: {
		from: '2w'
	}
};

const appname = 'com.toggl-tempo';
const prefs = new Preferences(appname, prefsInit);

const report = async() => {

	const [, fromValue, fromType] = defaultFrom.exec(prefs.toggl.from);
	const fromParsed = moment().subtract(parseInt(fromValue), fromType);
	const custom = {};

	if(argv.range || argv.r) {
		console.log('Format YYYY/MM/DD');
		const { cFrom, cTo } = await inquirer.prompt([
			{ name: 'cFrom', type: 'date', locale: 'zh-cn', message: 'Report from:', format: { year: 'numeric', month: '2-digit', day: '2-digit', hour: undefined, minute: undefined }, default: fromParsed.toDate() },
			{ name: 'cTo', type: 'date', locale: 'zh-cn', message: 'Report to:', format: { year: 'numeric', month: '2-digit', day: '2-digit', hour: undefined, minute: undefined } }
		]);

		const isCorrect = (cTo - cFrom) >= 0;

		custom.from = isCorrect ? cFrom : cTo;
		custom.to = isCorrect ? cTo : cFrom;
	}

	return {
		...prefs,
		report: {
			from: (custom.from ? moment(custom.from) : fromParsed).format('YYYY-MM-DD'),
			to: (custom.to ? moment(custom.to) : moment()).format('YYYY-MM-DD')
		}
	}
}

module.exports.init = async() => {

	if(prefs.tempo.token && prefs.toggl.token && !argv.configure && !argv.c)
		return report();

	console.log('See in https://track.toggl.com/profile -> API Token')
	const { tToken } = await inquirer.prompt([
		{ name: 'tToken', type: (prefs.toggl.token ? 'password' : 'input'), message: 'Toggl token:', default: prefs.toggl.token }
	]);

	const togglUser = await toggl.getUser(tToken);

	const { email, togglWorkSpace } = await inquirer.prompt([
		{ name: 'email', type: 'input', message: 'Your email:', default: togglUser.email },
		{ name: 'togglWorkSpace', type: 'input', message: 'Toggl work space ID:', default: togglUser.workSpaceId }
	]);

	const { domain } = await inquirer.prompt([
		{ name: 'domain', type: 'input', message: 'Atlassian domain:', default: 'fizzmod' }
	]);

	console.log('Your browser will be opened in 3 seconds');
	console.log('See in the URL ".../jira/people/{yourAccountId}"');

	setTimeout(() => {
		open(`https://${domain}.atlassian.net/jira/people/me`);
	}, 3000)

	const { atlassianAccountId } = await inquirer.prompt([
		{ name: 'atlassianAccountId', type: 'input', message: 'Your Atlassian account ID:', default: prefs.tempo.workderId }
	]);

	console.log(`See in https://${domain}.atlassian.net/plugins/servlet/ac/io.tempo.jira/tempo-app#!/configuration/api-integration`)
	const { tempoToken, from } = await inquirer.prompt([
		{ name: 'tempoToken', type: (prefs.tempo.token ? 'password' : 'input'), message: 'Tempo token:', default: prefs.tempo.token },
		{ name: 'from', type: 'rawlist', message: 'Default report from:', default: '2w', choices: [
			{ name: '1 day', value: '1d' },
			{ name: '2 days', value:'2d' },
			{ name: '3 days', value:'3d' },
			{ name: '4 days', value:'4d' },
			{ name: '5 days', value:'5d' },
			{ name: '6 days', value:'6d' },
			new inquirer.Separator(),
			{ name: '1 week', value: '1w' },
			{ name: '2 weeks', value: '2w' },
			{ name: '3 weeks', value: '3w' },
			new inquirer.Separator(),
			{ name: '1 month', value: '1M' },
			new inquirer.Separator()
		]}
	]);

	prefs.atlassian.domain = domain;
	prefs.tempo.token = tempoToken;
	prefs.tempo.workderId = atlassianAccountId;
	prefs.toggl.token = tToken;
	prefs.toggl.from = from;
	prefs.toggl.email = email;
	prefs.toggl.workSpaceId = togglWorkSpace;

	return report();
}