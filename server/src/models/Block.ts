import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import Paste from './Paste';

interface BlockAttributes {
  id: string;
  content: string;
  language: string;
  order: number;
  pasteId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BlockInput extends Optional<BlockAttributes, 'id' | 'createdAt' | 'updatedAt'> {}
export interface BlockOutput extends Required<BlockAttributes> {}

class Block extends Model<BlockAttributes, BlockInput> implements BlockAttributes {
  public id!: string;
  public content!: string;
  public language!: string;
  public order!: number;
  public pasteId!: string;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Block.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    language: {
      type: DataTypes.STRING,
      defaultValue: 'text',
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pasteId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Paste,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
  },
  {
    sequelize,
    modelName: 'Block',
    tableName: 'blocks',
  }
);

export default Block; 