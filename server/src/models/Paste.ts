import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import bcrypt from 'bcrypt';

interface PasteAttributes {
  id: string;
  title: string;
  content: string | null;
  expiresAt: Date | null;
  isPrivate: boolean;
  views: number;
  userId: string | null;
  customUrl: string | null;
  isEditable: boolean;
  password: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PasteInput extends Optional<PasteAttributes, 'id' | 'views' | 'customUrl' | 'isEditable' | 'password'> {}
export interface PasteOutput extends Required<PasteAttributes> {}

class Paste extends Model<PasteAttributes, PasteInput> implements PasteAttributes {
  public id!: string;
  public title!: string;
  public content!: string | null;
  public expiresAt!: Date | null;
  public isPrivate!: boolean;
  public views!: number;
  public userId!: string | null;
  public customUrl!: string | null;
  public isEditable!: boolean;
  public password!: string | null;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  
  // Determine if a paste is a Jupyter-style paste by checking for blocks
  public isJupyterStyle(): boolean {
    return this.content === null || this.content === ''; // If content is empty/null, assume Jupyter-style
  }
  
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
  
  // Check if the provided password is correct
  public async verifyPassword(password: string): Promise<boolean> {
    if (!this.password) {
      return true; // No password set
    }
    
    const result = await bcrypt.compare(password, this.password);
    return result;
  }
  
  // Check if paste is password protected
  public isPasswordProtected(): boolean {
    const hasPassword = Boolean(this.password);
    return hasPassword;
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
      allowNull: true, // Allow null for Jupyter-style pastes
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
    password: {
      type: DataTypes.STRING,
      allowNull: true,
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
    hooks: {
      beforeCreate: async (paste: Paste) => {
        // Hash password if provided
        if (paste.password) {
          paste.password = await bcrypt.hash(paste.password, 10);
        }
      },
      beforeUpdate: async (paste: Paste) => {
        // Hash password if it was changed
        if (paste.changed('password') && paste.password) {
          paste.password = await bcrypt.hash(paste.password, 10);
        }
      }
    }
  }
);

export default Paste; 