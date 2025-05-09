import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface PasteAttributes {
  id: string;
  title: string;
  content: string;
  expiresAt: Date | null;
  isPrivate: boolean;
  views: number;
  userId: string | null;
  customUrl: string | null;
  isEditable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PasteInput extends Optional<PasteAttributes, 'id' | 'views' | 'customUrl' | 'isEditable'> {}
export interface PasteOutput extends Required<PasteAttributes> {}

class Paste extends Model<PasteAttributes, PasteInput> implements PasteAttributes {
  public id!: string;
  public title!: string;
  public content!: string;
  public expiresAt!: Date | null;
  public isPrivate!: boolean;
  public views!: number;
  public userId!: string | null;
  public customUrl!: string | null;
  public isEditable!: boolean;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  
  public incrementViews(): Promise<Paste> {
    this.views += 1;
    return this.save();
  }
  
  public isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  // Check if user can edit this paste
  public canEdit(userId: string | null): boolean {
    // Since we removed authentication, anyone can edit if paste is marked as editable
    return this.isEditable;
  }
}

Paste.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Untitled Paste',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    customUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        is: {
          args: /^[a-zA-Z0-9_-]+$/i,
          msg: 'Custom URL can only contain letters, numbers, underscores and hyphens'
        },
        len: {
          args: [3, 50],
          msg: 'Custom URL must be between 3 and 50 characters'
        }
      }
    },
    isEditable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'pastes',
    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['expiresAt'],
      },
      {
        fields: ['isPrivate'],
      },
      {
        fields: ['customUrl'],
        unique: true,
      },
    ],
  }
);

export default Paste; 