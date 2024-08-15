import { Column, Table, Model, Default } from 'sequelize-typescript';

@Table({
  tableName: 'sessions',
})
export class SessionModel extends Model {
  @Column
  cuid: string;

  @Default(false)
  @Column
  hasAudio: boolean;

  @Default(false)
  @Column
  isComplete: boolean;
}
