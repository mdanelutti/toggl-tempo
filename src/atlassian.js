const axios = require('axios').default;

module.exports.getIssue = async (credentials, issueKey) => {

	const url = `https://${credentials.domain}.atlassian.net/rest/api/3/issue/${issueKey}`

	const res = await axios.get(url, {
		auth: {
			username: credentials.email,
			password: credentials.apiToken
		}
	});

	return res.data?.id ? res.data : null;
};