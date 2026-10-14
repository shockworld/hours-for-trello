const trelloId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export function createTrello({ apiKey, serviceToken, fetchImpl = fetch } = {}) {
  if (!apiKey || !serviceToken) throw new Error('TRELLO_API_KEY and TRELLO_SERVICE_TOKEN required');
  async function get(path, params = {}) {
    const url = new URL(`https://api.trello.com/1/${path}`);
    url.search = new URLSearchParams({ ...params, key: apiKey, token: serviceToken });
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`Trello API error: ${response.status}`);
    return response.json();
  }
  return {
    async isMember(boardId, memberId) {
      if (!trelloId(boardId) || !trelloId(memberId)) return false;
      const members = await get(`boards/${boardId}/members`, { fields: 'id' });
      return Array.isArray(members) && members.some(member => member.id === memberId);
    },
    async card(boardId, cardId) {
      if (!trelloId(cardId)) return null;
      const card = await get(`cards/${cardId}`, { fields: 'idBoard,name,shortUrl,closed' });
      if (card.idBoard !== boardId) return null;
      return { id: cardId, name: String(card.name || '').slice(0, 512),
        url: String(card.shortUrl || `https://trello.com/c/${cardId}`).slice(0, 300) };
    },
    async memberName(memberId) {
      const member = await get(`members/${memberId}`, { fields: 'fullName,username' });
      return String(member.fullName || member.username || memberId).slice(0, 100);
    },
  };
}
