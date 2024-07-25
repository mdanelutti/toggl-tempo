const axios = require('axios');
const { format, parseISO, sub, add } = require('date-fns');

const ticket = /[a-z0-9]+\-[0-9]+ /i;

const translateDuration = milliseconds => {

	const total = milliseconds / 1000 / 60 / 60;
	const hours = parseInt(total);
	const minutes = Math.round((total - hours) / 0.25);

	return ((hours + (minutes * 0.25)) * 60 * 60) || 900; // 900 = 15min
};

const formatRow = row => {
	const match = row.description.match(ticket);
	const desc = row.description.replace(match?.[0] || '', '');
	const time = translateDuration(row.dur);
	const isPR = desc === 'PR';

	return {
		ticket: match?.[0].trim(),
		description: isPR ? 'Revisión de PR' : desc,
		rawDescription: isPR ? row.description.replace(' PR', ' Revisión de PR') : row.description,
		time,
		tags: row.tags,
		date: format(parseISO(row.start), 'yyyy-MM-dd'),
		hour: format(parseISO(row.start), 'HH:mm:00')
	};
};

const timesSheets = {};
const addRowToTimeSheet = row => {
	const rowFormatted = formatRow(row);

	if(!timesSheets[rowFormatted.date])
		timesSheets[rowFormatted.date] = {};

	if(!timesSheets[rowFormatted.date][rowFormatted.rawDescription])
		timesSheets[rowFormatted.date][rowFormatted.rawDescription] = { ...rowFormatted, time: 0 }

	timesSheets[rowFormatted.date][rowFormatted.rawDescription].time += rowFormatted.time;
};

const generateTimesheet = (pages, from, to) => {
	pages
		.map(page => page.data)
		.flat()
		.forEach(row => {
			addRowToTimeSheet(row)
		});

	delete timesSheets[format(sub(parseISO(from), { days: 1 }), 'yyyy-MM-dd')];
	delete timesSheets[format(add(parseISO(to), { days: 1 }), 'yyyy-MM-dd')];

	return timesSheets;
}

module.exports.getUser = async(apiToken) => {
	const res = await axios.get('https://api.track.toggl.com/api/v9/me', {
		auth: {
			username: apiToken,
			password: 'api_token'
		}
	});

	return {
		email: res.data.email,
		workSpaceId: res.data.default_workspace_id
	};
};

const getPage = async(config, from, to, page = 1) => {

	const res = await axios.get('https://api.track.toggl.com/reports/api/v2/details', {
		params: {
			user_agent: config.email,
			workspace_id: config.workSpaceId,
			since: from,
			until: format(add(parseISO(to), { days: 1 }), 'yyyy-MM-dd'),
			order_desc: 'off',
			page
		},
		auth: {
			username: config.token,
			password: 'api_token'
		}
	});

	return res.data;
};

module.exports.getReport = async({ toggl: config, report: { from, to } }) => {

	const firstPage = await getPage(config, from, to);

	const pendingPages = Math.ceil(firstPage.total_count / firstPage.per_page) - 1;
	if(!pendingPages)
		return generateTimesheet([firstPage], from, to);

	const pages = [firstPage];
	for (let i = 1; i <= pendingPages; i++) {
		pages.push(await getPage(config, from, to, i + 1));
	}

	return generateTimesheet(pages, from, to);
}

module.exports.getTags = async (apiToken, workSpaceId) => {

	const res = await axios.get(`https://api.track.toggl.com/api/v9/workspaces/${workSpaceId}/tags`, {
		auth: {
			username: apiToken,
			password: 'api_token'
		}
	});

	const tagsByName = {};

	for(const tag of res.data)
		tagsByName[tag.name] = tag;

	return tagsByName;
};

module.exports.createTags = (apiToken, workSpaceId, newTags) => {

	return Promise.all(newTags.map(tag => {
		return axios.post(`https://api.track.toggl.com/api/v9/workspaces/${workSpaceId}/tags`, {
			name: tag,
			workspace_id: workSpaceId
		},{
			auth: {
				username: apiToken,
				password: 'api_token'
			}
		});
	}))
};
