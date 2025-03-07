const axios = require('axios').default;

const { getIssue } = require('./atlassian');

let issueCache = {};

const report = {
	success: 0,
	error: 0,
	apiError: {}
}

const totals = {
	success: 0,
	ommited: 0,
	error: 0,
	tags: {}
};

module.exports.getRequiredWorkAttributes = async tempoToken => {

	const url = 'https://api.tempo.io/4/work-attributes/'

	const res = await axios.get(url, {
		headers: {
			'Authorization': `Bearer ${tempoToken}`
		}
	});

	const requiredAttributes = {};

	for(const {key, name, required, names } of res.data.results) {

		if(!required)
			continue;

		const keyNames = Object.keys(names);

		for(const keyName of keyNames)
			requiredAttributes[`${name}/${names[keyName]}`] = { key, value: keyName };
	}

	return Object.keys(requiredAttributes).length ? requiredAttributes : null;
};

const getServiceReport = async(account, from, to) => {

	const url = `https://api.tempo.io/4/worklogs/user/${account.workderId}`

	const res = await axios.get(url, {
		headers: {
			'Authorization': `Bearer ${account.token}`
		},
		params: {
			from,
			to,
			limit: 1000
		}
	});

	if(!res.data?.results?.length)
		return {};

	return res.data.results.reduce((accum, data) => {

		if(!accum[data.startDate])
			accum[data.startDate] = {};

		if(!accum[data.startDate][data.issue.id])
			accum[data.startDate][data.issue.id] = {};

		accum[data.startDate][data.issue.id][data.description] = {
			id: data.tempoWorklogId,
			time: data.timeSpentSeconds,
			issueId: data.issue.id,
			...data.attributes?.values?.length && {
				attributes: data.attributes.values.reduce((accum, attr) => {
					accum[attr.key] = attr;
					return accum;
				}, {})
			}
		};

		return accum;
	}, {});
};

const secondsToHs = seconds => (seconds / 60 / 60);

const publishWorklog = async(tempo, worklog, tempoWorklog) => {

	const body = {
		issueId: worklog.issueId,
		timeSpentSeconds: worklog.time,
		startDate: worklog.date,
		startTime: worklog.hour,
		description: worklog.description,
		authorAccountId: tempo.workderId,
		...(tempo.requiredAttributes || worklog.attributes || tempoWorklog.attributes) && { attributes: Object.values(worklog.attributes || tempoWorklog.attributes) }
	};

	const url = `https://api.tempo.io/4/worklogs/${worklog.id || ''}`;
	const method = worklog.id ? 'put' : 'post';

	try {

		await axios[method](url, body, {
			headers: {
				'Authorization': `Bearer ${tempo.token}`
			}
		});

		console.log(`${worklog.id ? 'Updated' : 'Created'}: ${worklog.ticket} | ${worklog.description} | ${worklog.id && tempoWorklog.time !== worklog.time ? `Change: ${secondsToHs(tempoWorklog.time)} ->` : ''} ${secondsToHs(worklog.time)} Hs${worklog.id && worklog.attributes ? ' | Attributes updated': ''}`)

		totals.success += worklog.time;
		report.success++;

		return true;
	} catch(err) {

		console.log(`Error ${worklog.id ? 'updating' : 'creating'}: ${worklog.ticket} | ${worklog.description}`)

		totals.error += worklog.time;
		report.error++;

		if(!report.apiError[worklog.date])
			report.apiError[worklog.date] = {};

		report.apiError[worklog.date][worklog.rawDescription] = {
			...worklog,
			apiMessage: err.message
		};

		return false
	}
};

const getIssueFromAtlasian = async(atlassianCredentials, ticket) => {

	if(issueCache[ticket])
		return issueCache[ticket];

	const issue = await getIssue(atlassianCredentials, ticket);

	if(issue) {
		issueCache[ticket] = issue
			? {
				id: issue.id,
				key: issue.key
			}
			: {};
	}

	return issueCache[ticket];
}

module.exports.sendTimesSheets = async(timesSheets, { tempo, report: { from, to }, toggl: { defaultTag}, atlassian: atlassianCredentials }) => {

	if(!Object.keys(timesSheets))
		return;

	const tempoReport = await getServiceReport(tempo, from, to);

	for await (day of Object.keys(timesSheets)) {
		console.log(`---------${day}---------`)
		for await (worklog of Object.values(timesSheets[day])) {

			(worklog.tags?.length ? worklog.tags : [defaultTag]).forEach(tag => {
				if(!totals.tags[tag])
					totals.tags[tag] = 0;

				totals.tags[tag] += worklog.time;
			});

			if(!worklog.ticket) {
				totals.ommited += worklog.time;
				console.log(`Omitted: ${worklog.description} | ${secondsToHs(worklog.time)} Hs`)
				continue;
			}

			const issue = await getIssueFromAtlasian(atlassianCredentials, worklog.ticket);

			if(!issue.id) {
				totals.ommited += worklog.time;
				console.log(`Omitted (The ticket does not exist): ${worklog.description} | ${secondsToHs(worklog.time)} Hs`)
				continue;
			}

			worklog.issueId = issue.id;

			const tempoWorklog = tempoReport[worklog.date]?.[issue.id]?.[worklog.description];

			if(tempoWorklog) {

				if(!worklog.tags && !tempoWorklog.attributes.length && defaultTag) {
					worklog.attributes = { [tempo.requiredAttributes[defaultTag].key]: tempo.requiredAttributes[defaultTag] };
				}

				if(!worklog.attributes && worklog.tags && tempo.requiredAttributes) {
					worklog.tags.forEach(tag => {

						const attribute = tempo.requiredAttributes[tag];

						if(!attribute)
							return;

						if(tempoWorklog.attributes?.[attribute.key]?.value !== attribute.value) {
							if(!worklog.attributes)
								worklog.attributes = tempoWorklog.attributes || {}

							worklog.attributes[attribute.key] = attribute;
						}
					});
				}

				if(!worklog.attributes && tempoWorklog.time === worklog.time) {
					totals.ommited += worklog.time;
					console.log(`Omitted without updates: ${worklog.ticket} | ${worklog.description} | ${secondsToHs(worklog.time)} Hs`);
					continue;
				}

				worklog.id = tempoWorklog.id
			} else {
				if(defaultTag) {
					if(!worklog.tags?.length) {
						worklog.attributes = { [tempo.requiredAttributes[defaultTag].key]: tempo.requiredAttributes[defaultTag] };
					} else {
						worklog.tags.forEach(tag => {

							const attribute = tempo.requiredAttributes[tag];

							if(attribute) {
								if(!worklog.attributes)
									worklog.attributes = {}

								worklog.attributes[attribute.key] = attribute;
							}
						});
					}
				}
			}

			await publishWorklog(tempo, worklog, tempoWorklog);
		}
		console.log('----------------------------')
		console.log('')
	}

	issueCache = null;

	console.log(`success: ${secondsToHs(totals.success)} Hs`);
	console.log(`ommited: ${secondsToHs(totals.ommited)} Hs`);
	console.log(`error: ${secondsToHs(totals.error)} Hs`);

	const totalHours = secondsToHs(totals.success + totals.ommited + totals.error);

	if(Object.values(report.apiError).length)
		console.log(`apiError: ${JSON.stringify(report.apiError, null, 2)}`);

	if(Object.keys(totals.tags).length) {
		console.log('')
		console.log('Report by Tags')
		Object.entries(totals.tags).forEach(([tag, seconds]) => {
			console.log(`${tag}: ${(secondsToHs(seconds) / totalHours * 100).toFixed(2)} %`);
		})
	}
};