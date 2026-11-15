function cleanCellText(cell) {
    return cell
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/\s+/g, ' ')
        .trim();
}

function validateSowHtml(html, weekCount) {
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map(([, row]) => {
            const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
            if (cells.length < 2) return null;
            return [cleanCellText(cells[0][1]), cleanCellText(cells[1][1])];
        })
        .filter(Boolean);

    if (rows.length !== weekCount * 5) {
        return `The generated SOW must contain exactly 5 lessons for each of its ${weekCount} weeks (${weekCount * 5} rows).`;
    }

    for (let index = 0; index < rows.length; index += 1) {
        const expectedWeek = Math.floor(index / 5) + 1;
        const expectedLesson = (index % 5) + 1;
        const week = rows[index][0].match(/^(?:week\s*)?(\d+)$/i);
        const lesson = rows[index][1].match(/^(?:lesson\s*)?(\d+)$/i);
        if (!week || !lesson || Number(week[1]) !== expectedWeek || Number(lesson[1]) !== expectedLesson) {
            return `The generated SOW rows must list weeks 1-${weekCount} in order, with lessons 1-5 in every week.`;
        }
    }

    return null;
}

module.exports = { validateSowHtml };
