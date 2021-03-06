import argon2 from 'argon2';
import { UserInput } from '../utilities/userInput';
import {
   Arg,
   Ctx,
   Field,
   InputType,
   Int,
   Mutation,
   ObjectType,
   Query,
   Resolver,
} from 'type-graphql';
import { User } from '../entities/User';
import { COOKIE_NAME } from '../utilities/constants';
import { MyContext } from '../utilities/types';
import { validateRegister } from '../utilities/validateRegister';

@ObjectType()
class FieldError {
   // ? means undefined
   @Field()
   field: string;

   @Field()
   message: string;
}

@ObjectType()
class Me {
   // ? means undefined
   @Field({ nullable: true })
   username?: String;

   @Field({ nullable: true })
   id?: String;

   @Field({ nullable: true })
   email?: String;
}

@ObjectType()
class UserResponse {
   // ? means undefined
   @Field(() => [FieldError], { nullable: true })
   errors?: FieldError[];

   @Field(() => User, { nullable: true })
   user?: User;
}

@Resolver(User)
export class UserResolver {
   // @FieldResolver(() => User)
   // friends(
   //    @Root() users: User[]
   //    // @Ctx() { userLoader } : MyContext
   // ) {
   //    const friends = Friend.find()
   // }

   // Queries
   @Query(() => Me)
   async me(@Ctx() { req }: MyContext) {
      if (!req.session.userId) {
         return null;
      }
      const user = await User.findOne(req.session.userId, {
         select: ['username', 'id', 'email'],
      });

      return { ...user };
   }

   @Query(() => [User])
   async users(): Promise<User[]> {
      const users = await User.find();
      return users;
   }

   @Query(() => User)
   async user(
      @Arg('userId', () => Int) userId: number
   ): Promise<User | undefined> {
      const user = await User.findOne(userId);
      return user;
   }

   // Mutations
   @Mutation(() => UserResponse)
   async login(
      @Arg('usernameOrEmail') usernameOrEmail: String,
      @Arg('password') password: String,
      @Ctx() { req }: MyContext
   ): Promise<UserResponse> {
      const user = await User.findOne(
         usernameOrEmail.includes('@')
            ? { where: { email: usernameOrEmail } }
            : { where: { username: usernameOrEmail } }
      );

      if (!user) {
         return {
            errors: [
               {
                  field: 'usernameOrEmail',
                  message: "Username doesn't exist",
               },
            ],
         };
      }

      const validPassword = await argon2.verify(
         user.password,
         password as string | Buffer
      );

      if (!validPassword) {
         return {
            errors: [
               {
                  field: 'password',
                  message: 'Invalid login, Please try again!',
               },
            ],
         };
      }

      req.session.userId = user.id;

      return { user };
   }

   @Mutation(() => UserResponse)
   async createUser(
      @Arg('args') { password, ...args }: UserInput,
      @Ctx() { req }: MyContext
   ): Promise<UserResponse> {
      const errors = validateRegister({ password, ...args });

      if (errors) {
         return { errors };
      }

      try {
         const hashedPassword = await argon2.hash(password);

         const user = await User.create({
            password: hashedPassword,
            ...args,
         }).save();

         req.session.userId = user.id;
         console.log(req.session);
         return { user };
      } catch (error) {
         console.log(`ERROR: ${error}`);
         if (error.code === '23505') {
            console.log('DUPLICATE KEY!!');
            if (error.detail.includes('username')) {
               return {
                  errors: [
                     {
                        field: 'username',
                        message: 'username already taken',
                     },
                  ],
               };
            }

            return {
               errors: [
                  {
                     field: 'email',
                     message: 'email already taken',
                  },
               ],
            };
         }
         return {
            errors: [
               {
                  field: 'Server',
                  message: 'Server error',
               },
            ],
         };
      }
   }

   @Mutation(() => Boolean)
   logout(@Ctx() { req, res }: MyContext) {
      return new Promise((resolve) =>
         req.session.destroy((err) => {
            if (err) {
               console.log(err);
               resolve(false);
               return;
            }
            res.clearCookie(COOKIE_NAME);
            resolve(true);
         })
      );
   }
}
