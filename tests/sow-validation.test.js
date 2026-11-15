const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSowHtml } = require('../sow-validation');

function createSow(weekCount, lessonsPerWeek = 5) {
    const rows = [];
    for (let week = 1; week <= weekCount; week += 1) {
        for (let lesson = 1; lesson <= lessonsPerWeek; lesson += 1) {
            rows.push(`<tr><td>Week ${week}</td><td>Lesson ${lesson}</td></tr>`);
        }
    }
    return `<table>${rows.join('')}</table>`;
}

test('accepts five ordered lessons for every requested week', () => {
    assert.equal(validateSowHtml(createSow(3), 3), null);
});

test('rejects a SOW with fewer than five lessons in a week', () => {
    assert.match(validateSowHtml(createSow(2, 2), 2), /exactly 5 lessons/);
});

test('rejects lessons or weeks that are not in the required order', () => {
    const html = createSow(1).replace('<td>Lesson 2</td>', '<td>Lesson 3</td>');
    assert.match(validateSowHtml(html, 1), /in order/);
});
