export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function serializeMaps(maps) {
  return JSON.stringify({ format: 'yozumind', version: 1, exportedAt: new Date().toISOString(), maps }, null, 2);
}

// Construct fresh objects and IDs so an import never overwrites existing maps.
export function parseMaps(text, newId) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  let source;
  if (Array.isArray(data)) source = data;
  else if (data?.format === 'yozumind' && data.version === 1) source = data.maps;
  else if (data?.root) source = [data];
  else throw new Error('請選擇 YoZuMind JSON 存檔（版本 1）。');
  if (!Array.isArray(source) || !source.length || source.length > 100) {
    throw new Error('存檔需包含 1 至 100 張心智圖。');
  }
  let count = 0;
  function node(value, depth = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.text !== 'string' || value.text.length > 10000 ||
        (value.children !== undefined && !Array.isArray(value.children)) ||
        depth > 100 || ++count > 10000) {
      throw new Error('節點格式不正確，或超過 10,000 個節點／100 層的限制。');
    }
    const result = { id: newId('n'), text: value.text, children: (value.children || []).map(child => node(child, depth + 1)) };
    if (typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color)) result.color = value.color;
    if (typeof value.collapsed === 'boolean') result.collapsed = value.collapsed;
    return result;
  }
  return source.map((map, i) => {
    if (!map || typeof map.title !== 'string' || map.title.length > 1000) throw new Error('心智圖名稱格式不正確。');
    return {
      id: newId('m'), title: map.title, icon: typeof map.icon === 'string' ? map.icon : 'diagram-3',
      layout: map.layout === 'right' ? 'right' : 'down', root: node(map.root),
      createdAt: Date.now() + i, updatedAt: Date.now(), rev: '',
    };
  });
}
