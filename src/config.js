const inquirer = require('inquirer');
const Preferences = require("preferences");
const open = require('open');
const { format, sub } = require('date-fns');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

inquirer.registerPrompt("date", require("inquirer-date-prompt"));

const { argv } = yargs(hideBin(process.argv))

const toggl = require('./toggl');
const { getRequiredWorkAttributes } = require('./tempo');

const prefsInit = {
	atlassian: {
		domain: 'janiscommerce'
	},
	tempo: {},
	toggl: {
		from: '{ "weeks": 2 }'
	}
};

const appname = 'com.toggl-tempo';
const prefs = new Preferences(appname, prefsInit);

const getReportRange = async() => {

	const fromDate = sub(new Date(), JSON.parse(prefs.toggl.from));
	const custom = {};

	if(argv.range || argv.r) {
		console.log('Format YYYY/MM/DD');
		const { cFrom, cTo } = await inquirer.prompt([
			{ name: 'cFrom', type: 'date', locale: 'zh-cn', message: 'Report from:', format: { year: 'numeric', month: '2-digit', day: '2-digit', hour: undefined, minute: undefined }, default: fromDate },
			{ name: 'cTo', type: 'date', locale: 'zh-cn', message: 'Report to:', format: { year: 'numeric', month: '2-digit', day: '2-digit', hour: undefined, minute: undefined } }
		]);

		const isCorrect = (cTo - cFrom) >= 0;

		custom.from = isCorrect ? cFrom : cTo;
		custom.to = isCorrect ? cTo : cFrom;
	}

	return {
		...prefs,
		report: {
			from: format(custom.from || fromDate, 'yyyy-MM-dd'),
			to: format(custom.to || new Date(), 'yyyy-MM-dd')
		}
	}
}

module.exports.init = async() => {

	if(prefs.tempo.token && prefs.tempo.hasOwnProperty('requiredAttributes') && prefs.toggl.token && !argv.configure && !argv.c)
		return getReportRange();

	console.log('See in https://track.toggl.com/profile -> API Token')
	const { tToken } = await inquirer.prompt([
		{ name: 'tToken', type: (prefs.toggl.token ? 'password' : 'input'), message: 'Toggl token:', default: prefs.toggl.token }
	]);

	const togglUser = await toggl.getUser(tToken);

	const { email, togglWorkSpace } = await inquirer.prompt([
		{ name: 'email', type: 'input', message: 'Your toggl email:', default: togglUser.email },
		{ name: 'togglWorkSpace', type: 'input', message: 'Toggl work space ID:', default: togglUser.workSpaceId }
	]);

	const { domain } = await inquirer.prompt([
		{ name: 'domain', type: 'input', message: 'Atlassian domain:', default: 'janiscommerce' }
	]);

	const { atlassianEmail } = await inquirer.prompt([
		{ name: 'atlassianEmail', type: 'input', message: 'Your Atlassian email:', default: prefs.atlassian.email }
	]);

	console.log('Your browser will be opened in 3 seconds');
	console.log('Please create an Atlasian API-Token');

	setTimeout(() => {
		open(`https://id.atlassian.com/manage-profile/security/api-tokens`);
	}, 3000)

	const { atlassianApiToken } = await inquirer.prompt([
		{ name: 'atlassianApiToken', type: (prefs.atlassian.apiToken ? 'password' : 'input'), message: 'Your Atlassian API-Token:', default: prefs.atlassian.apiToken }
	]);

	console.log('Your browser will be opened in 3 seconds');
	console.log('See in the URL ".../jira/people/{yourAccountId}"');

	setTimeout(() => {
		open(`https://${domain}.atlassian.net/jira/people/me`);
	}, 3000)

	const { atlassianAccountId } = await inquirer.prompt([
		{ name: 'atlassianAccountId', type: 'input', message: 'Your Atlassian account ID:', default: prefs.tempo.workderId }
	]);

	console.log(`See in https://${domain}.atlassian.net/plugins/servlet/ac/io.tempo.jira/tempo-app#!/configuration/api-integration`);
	const { tempoToken } = await inquirer.prompt([
		{ name: 'tempoToken', type: (prefs.tempo.token ? 'password' : 'input'), message: 'Tempo token:', default: prefs.tempo.token }
	]);

	console.log('Obtaining mandatory attributes from tempo');
	const requiredAttributes = await getRequiredWorkAttributes(tempoToken);

	let togglDefaultTag;

	if(!requiredAttributes)
		console.log('Tempo has no mandatory attributes');
	else {

		const existingTags = await toggl.getTags(tToken, togglWorkSpace);

		const pendingTags = [];

		const requiredTags = Object.keys(requiredAttributes);

		for(const requiredTag of requiredTags) {
			if(!existingTags[requiredTag])
				pendingTags.push(requiredTag);
		}

		if(pendingTags.length) {
			const { importTags } = await inquirer.prompt([
				{ name: 'importTags', type: 'confirm', message: 'Tempo has mandatory attributes, authorize to synchronize these tags in Toggl?', default: true }
			]);

			if(!importTags) {
				console.log('Sorry, you cannot continue');
				return;
			}

			await toggl.createTags(tToken, togglWorkSpace, pendingTags);
		}

		console.log('The tags were synchronized');

		({ togglDefaultTag } = await inquirer.prompt([
			{ name: 'togglDefaultTag', type: 'rawlist', message: 'Selects a default tag for tickets that do not have a tag:', default: prefs.toggl.defaultTag, choices: requiredTags.map(requiredTag => ({ name: requiredTag, value: requiredTag}))}
		]));
	}

	const { from } = await inquirer.prompt([
		{ name: 'from', type: 'rawlist', message: 'Default report from:', default: prefs.toggl.from, choices: [
			{ name: '1 day', value: '{ "days": 1 }' },
			{ name: '2 days', value: '{ "days": 2 }' },
			{ name: '3 days', value: '{ "days": 3 }' },
			{ name: '4 days', value: '{ "days": 4 }' },
			{ name: '5 days', value: '{ "days": 5 }' },
			{ name: '6 days', value: '{ "days": 6 }' },
			new inquirer.Separator(),
			{ name: '1 week', value: '{ "weeks": 1 }' },
			{ name: '2 weeks', value: '{ "weeks": 2 }' },
			{ name: '3 weeks', value: '{ "weeks": 3 }' },
			new inquirer.Separator(),
			{ name: '1 month', value: '{ "months": 1 }' },
			new inquirer.Separator()
		]}
	]);

	prefs.atlassian.domain = domain;
	prefs.atlassian.email = atlassianEmail;
	prefs.atlassian.apiToken = atlassianApiToken;
	prefs.tempo.token = tempoToken;
	prefs.tempo.workderId = atlassianAccountId;
	prefs.tempo.requiredAttributes = requiredAttributes;
	prefs.toggl.token = tToken;
	prefs.toggl.from = from;
	prefs.toggl.email = email;
	prefs.toggl.workSpaceId = togglWorkSpace;

	if(prefs.atlassian.email && prefs.atlassian.apiToken)
		prefs.atlassian.auth = btoa(`${prefs.atlassian.email}:${prefs.atlassian.apiToken}`)

	if(togglDefaultTag)
		prefs.toggl.defaultTag = togglDefaultTag;

	if(argv.configure || argv.c)
		return;

	return getReportRange();
}