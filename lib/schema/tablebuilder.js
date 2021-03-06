"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _lodash = require("lodash");

var helpers = _interopRequireWildcard(require("../helpers"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

// TableBuilder
// Takes the function passed to the "createTable" or "table/editTable"
// functions and calls it with the "TableBuilder" as both the context and
// the first argument. Inside this function we can specify what happens to the
// method, pushing everything we want to do onto the "allStatements" array,
// which is then compiled into sql.
// ------
function TableBuilder(client, method, tableName, fn) {
  this.client = client;
  this._fn = fn;
  this._method = method;
  this._schemaName = undefined;
  this._tableName = tableName;
  this._statements = [];
  this._single = {};

  if (!(0, _lodash.isFunction)(this._fn)) {
    throw new TypeError('A callback function must be supplied to calls against `.createTable` ' + 'and `.table`');
  }
}

TableBuilder.prototype.setSchema = function (schemaName) {
  this._schemaName = schemaName;
}; // Convert the current tableBuilder object "toSQL"
// giving us additional methods if we're altering
// rather than creating the table.


TableBuilder.prototype.toSQL = function () {
  if (this._method === 'alter') {
    (0, _lodash.extend)(this, AlterMethods);
  }

  this._fn.call(this, this);

  return this.client.tableCompiler(this).toSQL();
};

(0, _lodash.each)([// Each of the index methods can be called individually, with the
// column name to be used, e.g. table.unique('column').
'index', 'primary', 'unique', // Key specific
'dropPrimary', 'dropUnique', 'dropIndex', 'dropForeign'], function (method) {
  TableBuilder.prototype[method] = function () {
    this._statements.push({
      grouping: 'alterTable',
      method,
      args: (0, _lodash.toArray)(arguments)
    });

    return this;
  };
}); // Warn for dialect-specific table methods, since that's the
// only time these are supported.

const specialMethods = {
  mysql: ['engine', 'charset', 'collate'],
  postgresql: ['inherits']
};
(0, _lodash.each)(specialMethods, function (methods, dialect) {
  (0, _lodash.each)(methods, function (method) {
    TableBuilder.prototype[method] = function (value) {
      if (this.client.dialect !== dialect) {
        this.client.logger.warn(`Knex only supports ${method} statement with ${dialect}.`);
      }

      if (this._method === 'alter') {
        this.client.logger.warn(`Knex does not support altering the ${method} outside of create ` + `table, please use knex.raw statement.`);
      }

      this._single[method] = value;
    };
  });
});
helpers.addQueryContext(TableBuilder); // Each of the column types that we can add, we create a new ColumnBuilder
// instance and push it onto the statements array.

const columnTypes = [// Numeric
'tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double', 'real', 'bit', 'boolean', 'serial', // Date / Time
'date', 'datetime', 'timestamp', 'time', 'year', // String
'char', 'varchar', 'tinytext', 'tinyText', 'text', 'mediumtext', 'mediumText', 'longtext', 'longText', 'binary', 'varbinary', 'tinyblob', 'tinyBlob', 'mediumblob', 'mediumBlob', 'blob', 'longblob', 'longBlob', 'enum', 'set', // Increments, Aliases, and Additional
'bool', 'dateTime', 'increments', 'bigincrements', 'bigIncrements', 'integer', 'biginteger', 'bigInteger', 'string', 'json', 'jsonb', 'uuid', 'enu', 'specificType']; // For each of the column methods, create a new "ColumnBuilder" interface,
// push it onto the "allStatements" stack, and then return the interface,
// with which we can add indexes, etc.

(0, _lodash.each)(columnTypes, function (type) {
  TableBuilder.prototype[type] = function () {
    const args = (0, _lodash.toArray)(arguments);
    const builder = this.client.columnBuilder(this, type, args);

    this._statements.push({
      grouping: 'columns',
      builder
    });

    return builder;
  };
}); // The "timestamps" call is really just sets the `created_at` and `updated_at` columns.

TableBuilder.prototype.timestamps = function timestamps() {
  const method = arguments[0] === true ? 'timestamp' : 'datetime';
  const createdAt = this[method]('created_at');
  const updatedAt = this[method]('updated_at');

  if (arguments[1] === true) {
    const now = this.client.raw('CURRENT_TIMESTAMP');
    createdAt.notNullable().defaultTo(now);
    updatedAt.notNullable().defaultTo(now);
  }

  return;
}; // Set the comment value for a table, they're only allowed to be called
// once per table.


TableBuilder.prototype.comment = function (value) {
  if (typeof value !== 'string') {
    throw new TypeError('Table comment must be string');
  }

  this._single.comment = value;
}; // Set a foreign key on the table, calling
// `table.foreign('column_name').references('column').on('table').onDelete()...
// Also called from the ColumnBuilder context when chaining.


TableBuilder.prototype.foreign = function (column, keyName) {
  const foreignData = {
    column: column,
    keyName: keyName
  };

  this._statements.push({
    grouping: 'alterTable',
    method: 'foreign',
    args: [foreignData]
  });

  let returnObj = {
    references(tableColumn) {
      let pieces;

      if ((0, _lodash.isString)(tableColumn)) {
        pieces = tableColumn.split('.');
      }

      if (!pieces || pieces.length === 1) {
        foreignData.references = pieces ? pieces[0] : tableColumn;
        return {
          on(tableName) {
            if (typeof tableName !== 'string') {
              throw new TypeError(`Expected tableName to be a string, got: ${typeof tableName}`);
            }

            foreignData.inTable = tableName;
            return returnObj;
          },

          inTable() {
            return this.on.apply(this, arguments);
          }

        };
      }

      foreignData.inTable = pieces[0];
      foreignData.references = pieces[1];
      return returnObj;
    },

    withKeyName(keyName) {
      foreignData.keyName = keyName;
      return returnObj;
    },

    onUpdate(statement) {
      foreignData.onUpdate = statement;
      return returnObj;
    },

    onDelete(statement) {
      foreignData.onDelete = statement;
      return returnObj;
    },

    _columnBuilder(builder) {
      (0, _lodash.extend)(builder, returnObj);
      returnObj = builder;
      return builder;
    }

  };
  return returnObj;
};

const AlterMethods = {
  // Renames the current column `from` the current
  // TODO: this.column(from).rename(to)
  renameColumn(from, to) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'renameColumn',
      args: [from, to]
    });

    return this;
  },

  dropTimestamps() {
    return this.dropColumns(['created_at', 'updated_at']);
  }

}; // Drop a column from the current table.
// TODO: Enable this.column(columnName).drop();

AlterMethods.dropColumn = AlterMethods.dropColumns = function () {
  this._statements.push({
    grouping: 'alterTable',
    method: 'dropColumn',
    args: (0, _lodash.toArray)(arguments)
  });

  return this;
};

var _default = TableBuilder;
exports.default = _default;
module.exports = exports.default;