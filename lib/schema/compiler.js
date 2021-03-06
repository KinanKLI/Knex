"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _helpers = require("./helpers");

var _lodash = require("lodash");

// The "SchemaCompiler" takes all of the query statements which have been
// gathered in the "SchemaBuilder" and turns them into an array of
// properly formatted / bound query strings.
function SchemaCompiler(client, builder) {
  this.builder = builder;
  this._commonBuilder = this.builder;
  this.client = client;
  this.schema = builder._schema;
  this.formatter = client.formatter(builder);
  this.sequence = [];
}

(0, _lodash.assign)(SchemaCompiler.prototype, {
  pushQuery: _helpers.pushQuery,
  pushAdditional: _helpers.pushAdditional,
  unshiftQuery: _helpers.unshiftQuery,
  createTable: buildTable('create'),
  createTableIfNotExists: buildTable('createIfNot'),
  alterTable: buildTable('alter'),
  dropTablePrefix: 'drop table ',

  dropTable(tableName) {
    this.pushQuery(this.dropTablePrefix + this.formatter.wrap(prefixedTableName(this.schema, tableName)));
  },

  dropTableIfExists(tableName) {
    this.pushQuery(this.dropTablePrefix + 'if exists ' + this.formatter.wrap(prefixedTableName(this.schema, tableName)));
  },

  raw(sql, bindings) {
    this.sequence.push(this.client.raw(sql, bindings).toSQL());
  },

  toSQL() {
    const sequence = this.builder._sequence;

    for (let i = 0, l = sequence.length; i < l; i++) {
      const query = sequence[i];
      this[query.method].apply(this, query.args);
    }

    return this.sequence;
  }

});

function buildTable(type) {
  return function (tableName, fn) {
    const builder = this.client.tableBuilder(type, tableName, fn); // pass queryContext down to tableBuilder but do not overwrite it if already set

    const queryContext = this.builder.queryContext();

    if (!(0, _lodash.isUndefined)(queryContext) && (0, _lodash.isUndefined)(builder.queryContext())) {
      builder.queryContext(queryContext);
    }

    builder.setSchema(this.schema);
    const sql = builder.toSQL();

    for (let i = 0, l = sql.length; i < l; i++) {
      this.sequence.push(sql[i]);
    }
  };
}

function prefixedTableName(prefix, table) {
  return prefix ? `${prefix}.${table}` : table;
}

var _default = SchemaCompiler;
exports.default = _default;
module.exports = exports.default;