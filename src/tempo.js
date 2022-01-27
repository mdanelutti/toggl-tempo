const axios = require('axios').default;

const report = {
	success: 0,
	error: 0,
	apiError: {}
}

const totals = {
	success: 0,
	ommited: 0,
	error: 0
};

const getServiceReport = async(account, from, to) => {
	const url = `https://api.tempo.io/core/3/worklogs/user/${account.workderId}`
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

		accum[data.startDate][`${data.issue.key} ${data.description}`] = {
			id: data.tempoWorklogId,
			time: data.timeSpentSeconds
		};

		return accum;
	}, {});
};

const secondsToHs = seconds => (seconds / 60 / 60);

const publishWorklog = async(account, worklog, tempoWorklog) => {
	const body = {
		issueKey: worklog.ticket,
		timeSpentSeconds: worklog.time,
		startDate: worklog.date,
		startTime: worklog.hour,
		description: worklog.description,
		authorAccountId: account.workderId
	};

	const url = `https://api.tempo.io/core/3/worklogs/${worklog.id || ''}`;
	const method = worklog.id ? 'put' : 'post';

	try {
		await axios[method](url, body, {
			headers: {
				'Authorization': `Bearer ${account.token}`
			}
		});

		console.log(`${worklog.id ? 'Updated' : 'Created'}: ${worklog.ticket} | ${worklog.description} | ${worklog.id ? `Change: ${secondsToHs(tempoWorklog.time)} ->` : ''} ${secondsToHs(worklog.time)} Hs`)

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

module.exports.sendTimesSheets = async(timesSheets, { tempo: account, report: { from, to } }) => {

	if(!Object.keys(timesSheets))
		return;

	const tempoReport = await getServiceReport(account, from, to);

	for await (day of Object.keys(timesSheets)) {
		console.log(`---------${day}---------`)
		for await (worklog of Object.values(timesSheets[day])) {
			if(!worklog.ticket) {
				totals.ommited += worklog.time;
				console.log(`Omitted: ${worklog.description} | ${secondsToHs(worklog.time)} Hs`)
				continue;
			}

			const tempoWorklog = tempoReport[worklog.date]?.[worklog.rawDescription];

			if(tempoWorklog) {
				if(tempoWorklog.time === worklog.time) {
					totals.ommited += worklog.time;
					console.log(`Omitted without updates: ${worklog.ticket} | ${worklog.description} | ${secondsToHs(worklog.time)} Hs`);
					continue;
				}

				worklog.id = tempoWorklog.id
			}

			await publishWorklog(account, worklog, tempoWorklog);
		}
		console.log('----------------------------')
		console.log('')
	}

	console.log(`success: ${secondsToHs(totals.success)} Hs`);
	console.log(`ommited: ${secondsToHs(totals.ommited)} Hs`);
	console.log(`error: ${secondsToHs(totals.error)} Hs`);

	if(Object.values(report.apiError).length)
		console.log(`apiError: ${JSON.stringify(report.apiError, null, 2)}`);
};