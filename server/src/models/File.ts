import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface FileAttributes {
  id: string;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  pasteId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FileInput extends Optional<FileAttributes, 'id'> {}
export interface FileOutput extends Required<FileAttributes> {}

class File extends Model<FileAttributes, FileInput> implements FileAttributes {
  public id!: string;
  public filename!: string;
  public originalname!: string;
  public mimetype!: string;
  public size!: number;
  public path!: string;
  public pasteId!: string;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

File.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    originalname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mimetype: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    path: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pasteId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'files',
    indexes: [
      {
        fields: ['pasteId'],
      },
    ],
  }
);

export default File; 