import {
  Column,
  CreatedAt,
  DeletedAt,
  Index,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({
  tableName: 'ivrs',
})
export class IvrModel extends Model {
  @Index
  @Column
  url: string;

  @Column
  jsonData: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @DeletedAt
  deletedAt: Date;
}
