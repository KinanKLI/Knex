"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _inherits = _interopRequireDefault(require("inherits"));

var _compiler = _interopRequireDefault(require("../../../query/compiler"));

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// SQLite3 Query Builder & Compiler
function QueryCompiler_SQLite3(client, builder) {
  _compiler.default.call(this, client, builder);

  const returning = this.single.returning;

  if (returning) {
    this.client.logger.warn('.returning() is not supported by sqlite3 and will not have any effect.');
  }
}

(0, _inherits.default)(QueryCompiler_SQLite3, _compiler.default);
(0, _lodash.assign)(QueryCompiler_SQLite3.prototype, {
  // The locks are not applicable in SQLite3
  forShare: emptyStr,
  forUpdate: emptyStr,

  // SQLite requires us to build the multi-row insert as a listing of select with
  // unions joining them together. So we'll build out this list of columns and
  // then join them all together with select unions to complete the queries.
  insert() {
    const insertValues = this.single.insert || [];
    let sql = this.with() + `insert into ${this.tableName} `;

    if (Array.isArray(insertValues)) {
      if (insertValues.length === 0) {
        return '';
      } else if (insertValues.length === 1 && insertValues[0] && (0, _lodash.isEmpty)(insertValues[0])) {
        return sql + this._emptyInsertValue;
      }
    } else if (typeof insertValues === 'object' && (0, _lodash.isEmpty)(insertValues)) {
      return sql + this._emptyInsertValue;
    }

    const insertData = this._prepInsert(insertValues);

    if ((0, _lodash.isString)(insertData)) {
      return sql + insertData;
    }

    if (insertData.columns.length === 0) {
      return '';
    }

    sql += `(${this.formatter.columnize(insertData.columns)})`; // backwards compatible error

    if (this.client.valueForUndefined !== null) {
      (0, _lodash.each)(insertData.values, bindings => {
        (0, _lodash.each)(bindings, binding => {
          if (binding === undefined) throw new TypeError('`sqlite` does not support inserting default values. Specify ' + 'values explicitly or use the `useNullAsDefault` config flag. ' + '(see docs http://knexjs.org/#Builder-insert).');
        });
      });
    }

    if (insertData.values.length === 1) {
      const parameters = this.formatter.parameterize(insertData.values[0], this.client.valueForUndefined);
      return sql + ` values (${parameters})`;
    }

    const blocks = [];
    let i = -1;

    while (++i < insertData.values.length) {
      let i2 = -1;
      const block = blocks[i] = [];
      let current = insertData.values[i];
      current = current === undefined ? this.client.valueForUndefined : current;

      while (++i2 < insertData.columns.length) {
        block.push(this.formatter.alias(this.formatter.parameter(current[i2]), this.formatter.wrap(insertData.columns[i2])));
      }

      blocks[i] = block.join(', ');
    }

    return sql + ' select ' + blocks.join(' union all select ');
  },

  // Compile a truncate table statement into SQL.
  truncate() {
    const table = this.single.table;
    return {
      sql: `delete from ${this.tableName}`,

      output() {
        return this.query({
          sql: `delete from sqlite_sequence where name = '${table}'`
        }).catch(_lodash.noop);
      }

    };
  },

  // Compiles a `columnInfo` query
  columnInfo() {
    const column = this.single.columnInfo; // The user may have specified a custom wrapIdentifier function in the config. We
    // need to run the identifiers through that function, but not format them as
    // identifiers otherwise.

    const table = this.client.customWrapIdentifier(this.single.table, _lodash.identity);
    return {
      sql: `PRAGMA table_info(\`${table}\`)`,

      output(resp) {
        const maxLengthRegex = /.*\((\d+)\)/;
        const out = (0, _lodash.reduce)(resp, function (columns, val) {
          let type = val.type;
          let maxLength = type.match(maxLengthRegex);

          if (maxLength) {
            maxLength = maxLength[1];
          }

          type = maxLength ? type.split('(')[0] : type;
          columns[val.name] = {
            type: type.toLowerCase(),
            maxLength,
            nullable: !val.notnull,
            defaultValue: val.dflt_value
          };
          return columns;
        }, {});
        return column && out[column] || out;
      }

    };
  },

  limit() {
    const noLimit = !this.single.limit && this.single.limit !== 0;
    if (noLimit && !this.single.offset) return ''; // Workaround for offset only,
    // see http://stackoverflow.com/questions/10491492/sqllite-with-skip-offset-only-not-limit

    return `limit ${this.formatter.parameter(noLimit ? -1 : this.single.limit)}`;
  }

});

function emptyStr() {
  return '';
}

var _default = QueryCompiler_SQLite3;
exports.default = _default;
module.exports = exports.default;